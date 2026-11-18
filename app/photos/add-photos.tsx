"use client";

// Photos -> "Add photos": put photos you already have into the Photos page.
//   From this device   pick one or many from the phone or the computer
//   From Google Drive  paste a link to a photo, or to a folder of photos
// Drive photos stay in Drive: they are listed here, not copied or moved.
// Except "Crew" photos: the customer sees those in their portal, so they are
// copied into the app (a customer's browser cannot open the Drive file).
// Photos from the device are made small here first (2400px, lib/imageResize.ts
// preparePhoto) and sent one per upload: Vercel refuses any upload over 4.5 MB,
// and a full-size phone photo is often bigger. Each one that fails says why.
//
// Where they were taken ("📍 Looks like <Account> — right?"): each photo's
// own GPS (EXIF), else, on a phone, where the phone is now. The active
// accounts within ~500 ft are suggested (app/api/photo-index/nearby):
//   one photo     Yes / Pick another (2+ in the same building: quick choices)
//   many photos   a review list, each photo with its suggested account (change
//                 any); photos with no place go under "Pick account" and use
//                 the Account field. Add saves them all.
// Nothing is filed on a suggestion alone: the account is only set by a tap
// (Yes, a choice) or by Add after the review.

import { useEffect, useState } from "react";
import { BigButton, CHEER, ErrorBox, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import { photoProblemText, preparePhoto, readUploadReply } from "@/lib/imageResize";
import { exifGps } from "@/lib/photoDate";
import { distanceText, phoneLocation, type GeoPoint } from "@/lib/photoLocation";

type Nearby = { accountId: string; accountName: string; address: string; feet: number };

/** A chosen photo, small, for the review list (its own short-lived address). */
function FileThumb({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const made = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the picture's address lives only while it is shown
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- a local file, not yet uploaded
    <img src={url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flex: "none" }} />
  ) : (
    <span style={{ width: 64, height: 64, flex: "none" }} />
  );
}

const onPhone = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

type Account = { id: string; name: string };
type Result = { added: number; already: number; notPhotos: number; problems: string[] };

/** The size photos from the device are kept at: sharp on a screen, well under the upload limit. */
const DEVICE_PHOTO = { fullSide: 2400, quality: 0.85 };

/** [saved kind, what the picker says]. "Crew" = regular job photos the customer sees. */
const KINDS: [string, string][] = [
  ["Visit", "Visit"],
  ["Crew", "Crew (customer sees these)"],
  ["Complaint", "Complaint"],
  ["Crew problem", "Crew problem"],
  ["Sub photo", "Sub photo"],
  ["Extra job", "Extra job"],
  ["Estimate", "Estimate"],
  ["Equipment", "Equipment"],
];

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function AddPhotos({ open, onClose, onAdded, startAccount }: { open: boolean; onClose: () => void; onAdded: () => void; startAccount: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [shareWith, setShareWith] = useState("");
  const [from, setFrom] = useState<"device" | "drive">("device");
  const [accountName, setAccountName] = useState("");
  const [kind, setKind] = useState("Visit");
  const [moment, setMoment] = useState<"" | "before" | "after">("");
  const [takenOn, setTakenOn] = useState(today());
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  // Per chosen photo: the accounts near where it was taken (null = no place known), and the account picked for it.
  const [places, setPlaces] = useState<(Nearby[] | null)[]>([]);
  const [perFile, setPerFile] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const [suggestionClosed, setSuggestionClosed] = useState(false);

  // Each opening starts fresh, on the account the page is showing (if one).
  useEffect(() => {
    if (!open) return;
    setAccountName(startAccount);
    setFiles([]);
    setPlaces([]);
    setPerFile([]);
    setSuggestionClosed(false);
    setLinks("");
    setError("");
    setResult(null);
    setTakenOn(today());
    fetch("/api/accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] }) => {
        const list = (data.accounts ?? data.data ?? [])
          .map((account) => ({ id: String(account.accountId ?? account.id ?? "").trim(), name: String(account.accountName ?? "").trim() }))
          .filter((account) => account.name);
        setAccounts(list.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => setAccounts([]));
    fetch("/api/photo-index/add")
      .then((response) => response.json())
      .then((data: { shareWith?: string }) => setShareWith(data.shareWith ?? ""))
      .catch(() => {});
  }, [open, startAccount]);

  /** The photos were chosen: find where each was taken, and the accounts near there. */
  async function choose(chosen: File[]) {
    setFiles(chosen);
    setPlaces(chosen.map(() => null));
    setPerFile(chosen.map(() => ""));
    setSuggestionClosed(false);
    if (chosen.length === 0) return;
    setLocating(true);
    try {
      let gps: (GeoPoint | null)[] = await Promise.all(chosen.map((file) => exifGps(file)));
      // No GPS in the photos and this is a phone: where the phone is now (a computer's place is the office: not used).
      if (!gps.some(Boolean) && onPhone()) {
        const here = await phoneLocation();
        if (here) gps = chosen.map(() => ({ lat: here.lat, lng: here.lng }));
      }
      if (!gps.some(Boolean)) return;
      const reply = (await fetch("/api/photo-index/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: gps.map((point) => point ?? {}) }),
      }).then((response) => response.json())) as { success?: boolean; results?: Nearby[][] };
      if (!reply.success || !reply.results) return;
      const found = gps.map((point, index) => (point ? (reply.results?.[index] ?? []) : null));
      setPlaces(found);
      // Many photos: each starts on its nearest account (changed in the review list; saved only with Add).
      if (chosen.length > 1) setPerFile(found.map((near) => near?.[0]?.accountName ?? ""));
    } catch {
      // No suggestion: the Account field works as always.
    } finally {
      setLocating(false);
    }
  }

  const sorted = files.length > 1 && places.some((near) => near && near.length > 0);
  const single = files.length === 1 ? (places[0] ?? null) : null;

  async function save() {
    setError("");
    setResult(null);
    const name = accountName.trim();
    const account = accounts.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    // The review list may give every photo its own account; then the Account field can stay empty.
    if (!name && !(from === "device" && sorted && files.every((_, index) => perFile[index]?.trim()))) {
      setError("Type the account these photos belong to.");
      return;
    }
    if (accounts.length > 0 && !account && !(from === "device" && sorted)) {
      setError("Pick the account from the list as you type, so the photos land on the right one.");
      return;
    }
    // The review list: every photo needs an account from the list (its own, or the Account field for the rest).
    const fileAccounts = files.map((_, index) => {
      const picked = (sorted ? perFile[index] : "") || name;
      return accounts.find((entry) => entry.name.toLowerCase() === picked.trim().toLowerCase()) ?? null;
    });
    if (from === "device" && sorted && accounts.length > 0 && fileAccounts.some((entry) => !entry)) {
      const missing = fileAccounts.filter((entry) => !entry).length;
      setError(`Pick the account for ${missing} photo${missing === 1 ? "" : "s"} (under "Pick account"), or type it in the Account field for the rest.`);
      return;
    }
    if (from === "device" && files.length === 0) {
      setError("Choose at least one photo.");
      return;
    }
    if (from === "drive" && !links.trim()) {
      setError("Paste a Google Drive link to a photo or to a folder of photos.");
      return;
    }
    const details = { accountName: account?.name ?? name, accountId: account?.id ?? "", kind, moment, takenOn: from === "drive" && !takenOn ? "" : takenOn };
    setBusy(true);
    try {
      let outcome: Result;
      if (from === "device") {
        // One at a time: made small here, then sent on its own.
        outcome = { added: 0, already: 0, notPhotos: 0, problems: [] };
        for (const [i, file] of files.entries()) {
          setProgress(files.length > 1 ? `Adding ${i + 1} of ${files.length}…` : "Adding…");
          const label = files.length > 1 ? `Photo ${i + 1} (${file.name})` : file.name;
          const prepared = await preparePhoto(file, file.name, DEVICE_PHOTO);
          if (!prepared.ok) {
            outcome.problems.push(`${label}: ${photoProblemText(prepared.problem)}`);
            continue;
          }
          const form = new FormData();
          const own = fileAccounts[i];
          for (const [key, value] of Object.entries(own ? { ...details, accountName: own.name, accountId: own.id } : details)) form.append(key, value);
          form.append("file", new File([prepared.full], `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`, { type: "image/jpeg" }));
          try {
            const reply = await readUploadReply<Partial<Result> & { success?: boolean; error?: string }>(await fetch("/api/photo-index/add", { method: "POST", body: form }));
            if (!reply.ok) {
              outcome.problems.push(`${label}: ${reply.error}`);
              continue;
            }
            outcome.added += reply.data.added ?? 0;
            outcome.already += reply.data.already ?? 0;
            outcome.notPhotos += reply.data.notPhotos ?? 0;
            outcome.problems.push(...(reply.data.problems ?? []).map((problem) => `${label}: ${problem}`));
          } catch {
            outcome.problems.push(`${label}: No connection. Check the signal and try this one again.`);
          }
        }
      } else {
        const reply = await readUploadReply<Partial<Result> & { success?: boolean; error?: string }>(
          await fetch("/api/photo-index/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...details, links }) })
        );
        if (!reply.ok) throw new Error(reply.error);
        const data = reply.data;
        outcome = { added: data.added ?? 0, already: data.already ?? 0, notPhotos: data.notPhotos ?? 0, problems: data.problems ?? [] };
      }
      if (outcome.added > 0) {
        showToast(`${CHEER.logged} ${outcome.added} photo${outcome.added === 1 ? "" : "s"} added.`);
        onAdded();
      }
      // Everything went in cleanly: close. Otherwise stay and say what happened.
      if (outcome.added > 0 && outcome.problems.length === 0 && outcome.already === 0 && outcome.notPhotos === 0) onClose();
      else setResult(outcome);
      setFiles([]);
      setPlaces([]);
      setPerFile([]);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "The photos were not added: no connection. Check the signal and try again.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <Sheet
      open={open}
      title="Add photos"
      text="Photos you already have, from this device or from Google Drive."
      onClose={() => {
        if (!busy) onClose();
      }}
      busy={busy}
      actions={
        <BigButton busy={busy} busyLabel={from === "drive" ? (kind === "Crew" ? "Copying from Drive… (can take a few minutes)" : "Looking in Drive…") : progress || "Adding…"} onClick={() => void save()}>
          {from === "device" ? (files.length > 0 ? `Add ${files.length} photo${files.length === 1 ? "" : "s"}` : "Add photos") : "Add from Google Drive"}
        </BigButton>
      }
    >
      <div className="ui-chips" role="group" aria-label="Where the photos are">
        <button type="button" className="ui-chip" aria-pressed={from === "device"} onClick={() => setFrom("device")} disabled={busy}>
          From this device
        </button>
        <button type="button" className="ui-chip" aria-pressed={from === "drive"} onClick={() => setFrom("drive")} disabled={busy}>
          From Google Drive
        </button>
      </div>

      {/* One photo: "Looks like <Account> — right?" (2+ in the same building: each one). Filed only on a tap. */}
      {from === "device" && single && single.length > 0 && !suggestionClosed && accountName.trim().toLowerCase() !== single[0].accountName.toLowerCase() ? (
        <div className="ui-savestatus" role="status">
          <p className="ui-strong">
            📍 {single.length === 1 ? `Looks like ${single[0].accountName} — right?` : "Taken near more than one account. Which one?"}
          </p>
          <div className="ui-chips" role="group" aria-label="Suggested account">
            {single.map((near) => (
              <button
                key={near.accountId}
                type="button"
                className="ui-chip"
                disabled={busy}
                onClick={() => {
                  setAccountName(near.accountName);
                  setSuggestionClosed(true);
                }}
              >
                {single.length === 1 ? "Yes" : `${near.accountName} · ${distanceText(near.feet)}`}
              </button>
            ))}
            <button type="button" className="ui-chip" disabled={busy} onClick={() => setSuggestionClosed(true)}>
              Pick another
            </button>
          </div>
        </div>
      ) : null}

      <div className="ui-field">
        <label className="ui-label" htmlFor="add-photos-account">
          {sorted && from === "device" ? "Account (for the photos under Pick account)" : "Account"}
        </label>
        <input
          id="add-photos-account"
          className="ui-input"
          list="add-photos-accounts"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder="Start typing the account name"
          autoComplete="off"
          disabled={busy}
        />
        <datalist id="add-photos-accounts">
          {accounts.map((account) => (
            <option key={`${account.id}-${account.name}`} value={account.name} />
          ))}
        </datalist>
      </div>

      <SelectField label="What are the photos of?" value={kind} onChange={(event) => setKind(event.target.value)} disabled={busy}>
        {KINDS.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </SelectField>
      {kind === "Crew" ? (
        <p className="ui-hint">
          The customer sees these in their portal (if the account&apos;s &quot;Show crew photos to customer&quot; is on).
          {from === "drive" ? " From Drive they are copied into the app, up to 60 at a time." : ""}
        </p>
      ) : null}

      <div className="ui-field">
        <span className="ui-label">Before or after?</span>
        <div className="ui-chips" role="group" aria-label="Before or after">
          {(
            [
              ["", "Neither"],
              ["before", "Before"],
              ["after", "After"],
            ] as const
          ).map(([value, text]) => (
            <button key={text} type="button" className="ui-chip" aria-pressed={moment === value} onClick={() => setMoment(value)} disabled={busy}>
              {text}
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Day the photos were taken"
        type="date"
        optional={from === "drive"}
        hint={from === "drive" ? "Leave empty to use each file's own date in Drive." : undefined}
        value={takenOn}
        max={today()}
        onChange={(event) => setTakenOn(event.target.value)}
        disabled={busy}
      />

      {from === "device" ? (
        <div className="ui-field">
          <label className="ui-label" htmlFor="add-photos-files">
            Photos
          </label>
          <input
            id="add-photos-files"
            type="file"
            accept="image/*"
            multiple
            className="ui-input"
            disabled={busy}
            onChange={(event) => void choose(Array.from(event.target.files ?? []))}
          />
          <p className="ui-hint">
            {files.length > 0 ? `${files.length} chosen.` : "Pick one or many. They are made smaller on this device before they are sent."}
            {locating ? " Looking where they were taken…" : ""}
          </p>
        </div>
      ) : null}

      {/* Many photos with places: sorted by where each was taken. Change any, then Add saves them all. */}
      {from === "device" && sorted ? (
        <div className="ui-field">
          <span className="ui-label">Sorted by where they were taken</span>
          <p className="ui-hint">Each photo has the account it was taken nearest to. Change any that are wrong. Nothing is saved until you tap Add.</p>
          {[...files.keys()]
            .sort((a, b) => Number(!perFile[a]) - Number(!perFile[b]) || (perFile[a] || "").localeCompare(perFile[b] || ""))
            .map((index, position, order) => {
              const near = places[index] ?? [];
              const firstPick = !perFile[index] && (position === 0 || perFile[order[position - 1]]);
              return (
                <div key={index}>
                  {firstPick ? <p className="ui-strong" style={{ marginTop: 8 }}>Pick account (no place found)</p> : null}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <FileThumb file={files[index]} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        className="ui-input"
                        list="add-photos-accounts"
                        aria-label={`Account for photo ${index + 1}`}
                        value={perFile[index] ?? ""}
                        placeholder={accountName ? `${accountName} (the Account field)` : "Pick the account"}
                        onChange={(event) => setPerFile((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                        disabled={busy}
                      />
                      {near.length > 1 ? (
                        <div className="ui-chips" role="group" aria-label="Accounts near where it was taken">
                          {near.map((entry) => (
                            <button
                              key={entry.accountId}
                              type="button"
                              className="ui-chip"
                              aria-pressed={perFile[index] === entry.accountName}
                              disabled={busy}
                              onClick={() => setPerFile((current) => current.map((value, i) => (i === index ? entry.accountName : value)))}
                            >
                              📍 {entry.accountName}
                            </button>
                          ))}
                        </div>
                      ) : near.length === 1 && perFile[index] === near[0].accountName ? (
                        <p className="ui-hint">📍 Taken {distanceText(near[0].feet)} from it</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}

      {from === "device" ? null : (
        <>
          <TextAreaField
            label="Google Drive links"
            hint={kind === "Crew" ? "A link to one photo, or to a folder of photos. One per line. Copies are made; the files in Drive are not changed." : "A link to one photo, or to a folder of photos. One per line. The photos stay in Drive."}
            rows={3}
            placeholder="https://drive.google.com/drive/folders/…"
            value={links}
            onChange={(event) => setLinks(event.target.value)}
            disabled={busy}
          />
          <p className="ui-hint">
            The app must be able to see them. In Drive, tap Share and either set &quot;Anyone with the link&quot;, or add{" "}
            <span className="ui-strong ui-code-inline">{shareWith || "the app's Google account"}</span> as a Viewer.
          </p>
        </>
      )}

      {error ? <ErrorBox title="Not added yet." text={error} /> : null}
      {result && result.added === 0 && result.problems.length > 0 ? <ErrorBox title="No photos were added." text="See why for each photo below." /> : null}
      {result ? (
        <div className="ui-savestatus" role="status">
          <p>
            {result.added} added
            {result.already > 0 ? ` · ${result.already} were already here` : ""}
            {result.notPhotos > 0 ? ` · ${result.notPhotos} skipped (not photos)` : ""}
          </p>
          {result.problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}
