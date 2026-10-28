"use client";

// Photos: every photo in the app in one place, by account, issue and date.
// Staff only (proxy.ts default gate, and the API checks the staff session).
// Behind FEATURE_PHOTOS. The page reads the photo index
// (/api/photo-index); the files stay where they are.
//
// Default view: grouped by account, newest first, a grid under each account.
// Before / After photos of the same day sit side by side. Tap a photo for
// full screen: swipe left / right, who and when, and a button to the item it
// belongs to. Small thumbnails; more load as you scroll.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AddPhotos from "./add-photos";
import ImportPhotos from "./import-photos";
import AccountLink from "../components/AccountLink";
import { AccountScopeBar, useAccountScope } from "../components/account-scope";
import { AddButton, BigButton, Counts, EmptyState, ErrorBox, Field, PullToRefresh, Screen, SearchBar, Sheet, SkeletonList, Tips, showToast } from "@/app/ui";

type Photo = {
  id: number;
  store: "blob" | "drive";
  url: string;
  accountId: string;
  accountName: string;
  kind: string;
  moment: "" | "before" | "after";
  linkedLabel: string;
  linkedHref: string;
  takenBy: string;
  takenAt: string;
  isImage: boolean;
  viaApp?: boolean;
  /** The "Show on TV" star. */
  showOnTv?: boolean;
  /** Small copy saved with the photo (site survey shots); "" = none. */
  thumbUrl?: string;
  /** The shot's label ("Alarm panel"). */
  caption?: string;
  /** Crew photos: their tag, and hidden from the customer portal. */
  tag?: string;
  hiddenFromCustomer?: boolean;
};

type ApiAnswer = {
  success?: boolean;
  on?: boolean;
  photos?: Photo[];
  more?: boolean;
  counts?: { total: number; week: number; problems: number; beforeAfter: number } | null;
  accounts?: { name: string; count: number }[] | null;
};

const KINDS = ["Complaint", "Crew problem", "Sub photo", "Extra job", "Estimate", "Equipment", "Visit", "Site survey", "Crew"];
type DateChoice = "all" | "today" | "week" | "month" | "pick";
const DATE_LABEL: Record<DateChoice, string> = { all: "Date", today: "Today", week: "This week", month: "This month", pick: "Dates" };

/* ---------- pictures ---------- */

function driveId(url: string): string {
  return url.match(/\/d\/([^/?]+)/)?.[1] ?? url.match(/[?&]id=([^&]+)/)?.[1] ?? "";
}

/** A small version for the grid: Next's image resizer for Blob files, Drive's own thumbnail for Drive files. */
function thumbUrl(photo: Photo): string {
  // Saved with its own small copy (site survey shots): no resizing needed.
  if (photo.thumbUrl) return photo.thumbUrl;
  if (photo.store === "drive") {
    const id = driveId(photo.url);
    // Added from Drive by hand: the file may be shared only with the app, so the app fetches its picture.
    if (photo.viaApp && id) return `/api/photo-index/drive?file=${encodeURIComponent(id)}&s=400`;
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w400` : photo.url;
  }
  return `/_next/image?url=${encodeURIComponent(photo.url)}&w=384&q=75`;
}

function fullUrl(photo: Photo): string {
  if (photo.store === "drive") {
    const id = driveId(photo.url);
    if (photo.viaApp && id) return `/api/photo-index/drive?file=${encodeURIComponent(id)}&s=1600`;
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600` : photo.url;
  }
  return `/_next/image?url=${encodeURIComponent(photo.url)}&w=1200&q=75`;
}

const dayKey = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const label = (photo: Photo) =>
  `${photo.moment === "before" ? "Before" : photo.moment === "after" ? "After" : photo.tag === "problem" ? "Problem" : photo.caption || photo.kind} · ${shortDate(photo.takenAt)}${photo.hiddenFromCustomer ? " · hidden" : ""}`;

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateRange(choice: DateChoice, from: string, to: string): { from: string; to: string } {
  const now = new Date();
  if (choice === "today") return { from: isoDay(now), to: isoDay(now) };
  if (choice === "week") {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return { from: isoDay(monday), to: isoDay(now) };
  }
  if (choice === "month") return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  if (choice === "pick") return { from, to };
  return { from: "", to: "" };
}

function Thumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  return (
    <button type="button" className="ph-thumb" onClick={onOpen} aria-label={`${label(photo)}${photo.accountName ? `, ${photo.accountName}` : ""}. Open full screen.`}>
      {photo.isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl(photo)} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="ph-file">PDF</span>
      )}
      <span className="ph-label">{label(photo)}</span>
    </button>
  );
}

/* ---------- full screen ---------- */

function Viewer({
  photos,
  index,
  onIndex,
  onClose,
  onStar,
  onHide,
}: {
  photos: Photo[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  onStar: (photo: Photo, on: boolean) => Promise<void>;
  onHide: (photo: Photo, hidden: boolean) => Promise<void>;
}) {
  const photo = photos[index];
  const [starring, setStarring] = useState(false);
  const [hiding, setHiding] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const go = useCallback((delta: number) => onIndex(Math.min(photos.length - 1, Math.max(0, index + delta))), [index, photos.length, onIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [go, onClose]);

  if (!photo) return null;
  return (
    <div
      className="ph-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${photos.length}`}
      onTouchStart={(event) => {
        touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        // A sideways swipe: left = next, right = the one before.
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="ph-viewer-top">
        <span>
          {index + 1} / {photos.length}
        </span>
        <button type="button" className="ph-viewer-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="ph-viewer-stage">
        {index > 0 ? (
          <button type="button" className="ph-viewer-btn ph-viewer-prev" onClick={() => go(-1)} aria-label="Photo before">
            ‹
          </button>
        ) : null}
        {photo.isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={photo.id} src={fullUrl(photo)} alt={`${label(photo)}${photo.accountName ? `, ${photo.accountName}` : ""}`} />
        ) : (
          <a className="ui-btn ui-btn-main" href={photo.url} target="_blank" rel="noopener noreferrer">
            Open the PDF
          </a>
        )}
        {index < photos.length - 1 ? (
          <button type="button" className="ph-viewer-btn ph-viewer-next" onClick={() => go(1)} aria-label="Next photo">
            ›
          </button>
        ) : null}
      </div>
      <div className="ph-viewer-info">
        <p className="ph-viewer-account">{photo.accountName ? <AccountLink accountId={photo.accountId} name={photo.accountName} /> : "No account"}</p>
        <p>
          {photo.moment === "before" ? "Before · " : photo.moment === "after" ? "After · " : ""}
          {photo.kind}
        </p>
        <p>
          {photo.takenBy ? `${photo.takenBy} · ` : ""}
          {longDate(photo.takenAt)}
        </p>
        <div className="ph-viewer-actions">
          {photo.linkedHref ? (
            <Link href={photo.linkedHref} className="ui-btn ui-btn-main" onClick={onClose}>
              {photo.linkedLabel || "Open"}
            </Link>
          ) : null}
          {/* The star: starred photos are the slideshow on the office TV. Pictures in the app's own storage only. */}
          {photo.isImage && photo.store === "blob" ? (
            <button
              type="button"
              className={photo.showOnTv ? "ui-btn ui-btn-main" : "ui-btn ui-btn-second"}
              aria-pressed={photo.showOnTv === true}
              disabled={starring}
              onClick={() => {
                setStarring(true);
                void onStar(photo, !photo.showOnTv).finally(() => setStarring(false));
              }}
            >
              {photo.showOnTv ? "★ On the TV" : "☆ Show on TV"}
            </button>
          ) : null}
          {/* Crew photos show in the customer portal unless hidden here (a Problem photo starts hidden). */}
          {photo.kind === "Crew" ? (
            <button
              type="button"
              className={photo.hiddenFromCustomer ? "ui-btn ui-btn-main" : "ui-btn ui-btn-second"}
              aria-pressed={photo.hiddenFromCustomer === true}
              disabled={hiding}
              onClick={() => {
                setHiding(true);
                void onHide(photo, !photo.hiddenFromCustomer).finally(() => setHiding(false));
              }}
            >
              {photo.hiddenFromCustomer ? "🚫 Hidden from customer · Show it" : "👁 Customer sees it · Hide"}
            </button>
          ) : null}
          <a className="ui-btn ui-btn-second ph-viewer-original" href={photo.url} target="_blank" rel="noopener noreferrer">
            Original file
          </a>
        </div>
      </div>
    </div>
  );
}

/* ---------- the page ---------- */

function PhotosContent() {
  const params = useSearchParams();
  const [state, setState] = useState<"loading" | "off" | "ready" | "failed">("loading");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState({ total: 0, week: 0, problems: 0, beforeAfter: 0 });
  const [accounts, setAccounts] = useState<{ name: string; count: number }[]>([]);

  // The "Show on TV" star: starred photos are the slideshow on the office TV.
  const starPhoto = useCallback(async (photo: Photo, on: boolean) => {
    try {
      const response = await fetch("/api/photo-index/star", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id, on }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      setPhotos((current) => current.map((item) => (item.id === photo.id ? { ...item, showOnTv: on } : item)));
      showToast(on ? "It will show on the TV." : "Taken off the TV.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
    }
  }, []);

  // A crew photo hidden from the customer portal, or shown again.
  const hidePhoto = useCallback(async (photo: Photo, hidden: boolean) => {
    try {
      const response = await fetch("/api/photo-index/hide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id, hidden }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      setPhotos((current) => current.map((item) => (item.id === photo.id ? { ...item, hiddenFromCustomer: hidden } : item)));
      showToast(hidden ? "Hidden from the customer." : "The customer sees it now.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
    }
  }, []);

  const [search, setSearch] = useState("");
  const [typed, setTyped] = useState("");
  const [account, setAccount] = useState(params.get("account") ?? "");
  const accountId = params.get("accountId") ?? "";
  // Opened from an account's page: a way back, for as long as that account is still the one showing.
  const scope = useAccountScope();
  const [kind, setKind] = useState("");
  const [group, setGroup] = useState<"" | "problems" | "before-after">("");
  const [dateChoice, setDateChoice] = useState<DateChoice>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [picker, setPicker] = useState<"account" | "kind" | "date" | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // The search box waits a moment after the last key.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const range = dateRange(dateChoice, from, to);
  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (search) q.set("q", search);
    if (account) q.set("account", account);
    if (accountId && account === (params.get("account") ?? "")) q.set("accountId", accountId);
    if (kind) q.set("kind", kind);
    if (group) q.set("group", group);
    const startOf = (day: string) => new Date(`${day}T00:00:00`);
    if (range.from && !Number.isNaN(startOf(range.from).getTime())) q.set("from", startOf(range.from).toISOString());
    if (range.to && !Number.isNaN(startOf(range.to).getTime())) {
      const end = startOf(range.to);
      end.setDate(end.getDate() + 1);
      q.set("to", end.toISOString());
    }
    // "This week" on the counts starts on the viewer's Monday.
    const now = new Date();
    q.set("weekStart", new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).toISOString());
    return q.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, account, accountId, kind, group, range.from, range.to]);

  const load = useCallback(
    async (cursor?: Photo) => {
      const q = new URLSearchParams(query);
      if (cursor) {
        q.set("beforeAt", cursor.takenAt);
        q.set("beforeId", String(cursor.id));
      }
      const response = await fetch(`/api/photo-index?${q.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as ApiAnswer;
      if (!response.ok || data.success === false) throw new Error("failed");
      return data;
    },
    [query]
  );

  const refresh = useCallback(async () => {
    try {
      const data = await load();
      if (!data.on) {
        setState("off");
        return;
      }
      setPhotos(data.photos ?? []);
      setMore(data.more === true);
      if (data.counts) setCounts(data.counts);
      if (data.accounts) setAccounts(data.accounts);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !more || photos.length === 0) return;
    setLoadingMore(true);
    try {
      const data = await load(photos[photos.length - 1]);
      setPhotos((current) => [...current, ...(data.photos ?? [])]);
      setMore(data.more === true);
    } catch {
      showToast("More photos did not load. Scroll again to retry.", "bad");
    } finally {
      setLoadingMore(false);
    }
  }, [load, loadingMore, more, photos]);

  // More load as you scroll: when the marker under the list comes into view.
  useEffect(() => {
    const marker = sentinel.current;
    if (!marker || !more) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "600px" });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [loadMore, more]);

  // Grouped by account, in the order they first appear (newest first).
  const groups = useMemo(() => {
    const byAccount = new Map<string, { name: string; items: { photo: Photo; index: number }[] }>();
    photos.forEach((photo, index) => {
      const name = photo.accountName || (photo.kind === "Equipment" ? "Equipment" : "No account");
      if (!byAccount.has(name)) byAccount.set(name, { name, items: [] });
      byAccount.get(name)?.items.push({ photo, index });
    });
    return [...byAccount.values()].map((entry) => {
      // Before / After of the same day, side by side.
      const days = new Map<string, { before: { photo: Photo; index: number }[]; after: { photo: Photo; index: number }[] }>();
      for (const item of entry.items) {
        if (!item.photo.moment) continue;
        const key = dayKey(item.photo.takenAt);
        if (!days.has(key)) days.set(key, { before: [], after: [] });
        days.get(key)?.[item.photo.moment].push(item);
      }
      const pairs: { day: string; before: { photo: Photo; index: number }; after: { photo: Photo; index: number } }[] = [];
      const paired = new Set<number>();
      for (const [day, sides] of days) {
        const count = Math.min(sides.before.length, sides.after.length);
        for (let i = 0; i < count; i++) {
          pairs.push({ day, before: sides.before[i], after: sides.after[i] });
          paired.add(sides.before[i].photo.id);
          paired.add(sides.after[i].photo.id);
        }
      }
      const first = entry.items[0]?.photo;
      return { name: entry.name, accountId: first?.accountName ? first.accountId : "", isAccount: Boolean(first?.accountName), total: entry.items.length, pairs, rest: entry.items.filter((item) => !paired.has(item.photo.id)) };
    });
  }, [photos]);

  const filtersOn = Boolean(search || account || kind || group || dateChoice !== "all");
  function clearFilters() {
    setTyped("");
    setSearch("");
    setAccount("");
    setKind("");
    setGroup("");
    setDateChoice("all");
    setFrom("");
    setTo("");
  }

  return (
    <Screen
      title="Photos"
      subtitle="Every photo in the app, by account, issue and date."
      backHref="/"
      addAction={state === "ready" ? <AddButton onClick={() => setAdding(true)}>Add photos</AddButton> : undefined}
    >
      {account && account === (params.get("account") ?? "") ? <AccountScopeBar scope={scope} what="photos" /> : null}
      {/* One account's Photos (from its page): bring in old crew photos for the customer portal. */}
      {state === "ready" && accountId && account === (params.get("account") ?? "") ? <ImportPhotos accountId={accountId} accountName={account} onImported={() => void refresh()} /> : null}
      <AddPhotos open={adding} onClose={() => setAdding(false)} onAdded={() => void refresh()} startAccount={account} />
      <Tips
        id="photos"
        ready={state === "ready"}
        steps={[
          { target: '[data-tip="counts"]', text: "Every photo in the app is here. Tap a number to see only those." },
          { target: '[data-tip="chips"]', text: "Narrow it down by account, by issue or by date." },
          { target: ".ph-thumb", text: "Tap a photo to see it full screen. Swipe left or right for the next one." },
          { target: ".ui-page-add .ui-btn-main", text: "Have photos on your phone or in Google Drive? Tap Add photos to put them here." },
        ]}
      />
      <PullToRefresh
        onRefresh={async () => {
          await refresh();
          showToast("Updated ✓");
        }}
      />

      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="Photos is not turned on here yet" text="It works once FEATURE_PHOTOS is on and this database has the photo index." />
      ) : state === "failed" ? (
        <ErrorBox title="The photos did not load." onRetry={() => void refresh()} />
      ) : (
        <>
          <Counts
            data-tip="counts"
            items={[
              { label: "This week", value: counts.week, tone: "info", pressed: dateChoice === "week" && !group, onClick: () => (dateChoice === "week" && !group ? setDateChoice("all") : (setGroup(""), setDateChoice("week"))) },
              { label: "Problems", value: counts.problems, tone: counts.problems > 0 ? "bad" : "good", pressed: group === "problems", onClick: () => setGroup(group === "problems" ? "" : "problems") },
              { label: "Before / After", value: counts.beforeAfter, tone: "good", pressed: group === "before-after", onClick: () => setGroup(group === "before-after" ? "" : "before-after") },
            ]}
          />

          <SearchBar value={typed} onChange={setTyped} label="Find an account" placeholder="Find an account" />

          <div className="ui-chips" role="group" aria-label="Filters" data-tip="chips">
            <button type="button" className="ui-chip" aria-pressed={account !== ""} onClick={() => setPicker("account")}>
              {account ? `Account: ${account}` : "Account"}
            </button>
            <button type="button" className="ui-chip" aria-pressed={kind !== ""} onClick={() => setPicker("kind")}>
              {kind ? `Issue: ${kind}` : "Issue"}
            </button>
            <button type="button" className="ui-chip" aria-pressed={dateChoice !== "all"} onClick={() => setPicker("date")}>
              {dateChoice === "pick" && (from || to) ? `${from || "…"} to ${to || "…"}` : DATE_LABEL[dateChoice]}
            </button>
          </div>

          <p className="ui-muted" role="status">
            {photos.length === 0 ? "No photos" : `Showing ${photos.length}${more ? "+" : ""} of ${counts.total} photos`}
            {filtersOn ? " · " : ""}
            {filtersOn ? (
              <button type="button" className="ui-link ph-clear" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </p>

          {photos.length === 0 ? (
            <EmptyState
              title={filtersOn ? "No photos match" : "No photos yet"}
              text={filtersOn ? "Tap Clear filters to see them all, or Add photos to put some here." : "Photos show up here as soon as someone adds one: on a complaint, a crew problem, an extra job, or from the sub portal. Have some already? Tap Add photos."}
              action={
                filtersOn ? (
                  <BigButton kind="second" onClick={clearFilters}>
                    Clear filters
                  </BigButton>
                ) : undefined
              }
            />
          ) : (
            groups.map((entry) => (
              <section key={entry.name} className="ph-group" aria-label={entry.name}>
                <div className="ui-card-row">
                  <h2 className="ui-section-title">{entry.isAccount ? <AccountLink accountId={entry.accountId} name={entry.name} /> : entry.name}</h2>
                  <span className="ui-muted">
                    {entry.total} photo{entry.total === 1 ? "" : "s"}
                  </span>
                </div>
                {entry.pairs.map((pair) => (
                  <div key={`${pair.before.photo.id}-${pair.after.photo.id}`} className="ph-pair">
                    <Thumb photo={pair.before.photo} onOpen={() => setViewer(pair.before.index)} />
                    <Thumb photo={pair.after.photo} onOpen={() => setViewer(pair.after.index)} />
                  </div>
                ))}
                {entry.rest.length > 0 ? (
                  <div className="ph-grid">
                    {entry.rest.map((item) => (
                      <Thumb key={item.photo.id} photo={item.photo} onOpen={() => setViewer(item.index)} />
                    ))}
                  </div>
                ) : null}
              </section>
            ))
          )}

          <div ref={sentinel} aria-hidden="true" />
          {loadingMore ? <SkeletonList rows={1} /> : null}
          {more && !loadingMore ? (
            <BigButton kind="second" onClick={() => void loadMore()}>
              Show more photos
            </BigButton>
          ) : null}
        </>
      )}

      <Sheet open={picker === "account"} title="Show one account's photos" onClose={() => setPicker(null)}>
        <ul className="ui-picker-list">
          <li>
            <button type="button" className="ui-picker-option" aria-pressed={account === ""} onClick={() => (setAccount(""), setPicker(null))}>
              All accounts
            </button>
          </li>
          {accounts.map((entry) => (
            <li key={entry.name}>
              <button type="button" className="ui-picker-option" aria-pressed={account === entry.name} onClick={() => (setAccount(entry.name), setPicker(null))}>
                {entry.name} ({entry.count})
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={picker === "kind"} title="Show one kind of photo" onClose={() => setPicker(null)}>
        <ul className="ui-picker-list">
          <li>
            <button type="button" className="ui-picker-option" aria-pressed={kind === ""} onClick={() => (setKind(""), setPicker(null))}>
              Every issue
            </button>
          </li>
          {KINDS.map((entry) => (
            <li key={entry}>
              <button type="button" className="ui-picker-option" aria-pressed={kind === entry} onClick={() => (setKind(entry), setPicker(null))}>
                {entry}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={picker === "date"} title="Show photos from" onClose={() => setPicker(null)} closeLabel="Done">
        <ul className="ui-picker-list">
          {(["all", "today", "week", "month"] as DateChoice[]).map((choice) => (
            <li key={choice}>
              <button type="button" className="ui-picker-option" aria-pressed={dateChoice === choice} onClick={() => (setDateChoice(choice), setPicker(null))}>
                {choice === "all" ? "Any date" : DATE_LABEL[choice]}
              </button>
            </li>
          ))}
        </ul>
        <p className="ui-strong">Or pick dates</p>
        <Field label="From" type="date" optional value={from} onChange={(event) => (setFrom(event.target.value), setDateChoice("pick"))} />
        <Field label="To" type="date" optional value={to} onChange={(event) => (setTo(event.target.value), setDateChoice("pick"))} />
      </Sheet>

      {viewer !== null ? <Viewer photos={photos} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} onStar={starPhoto} onHide={hidePhoto} /> : null}
    </Screen>
  );
}

export default function PhotosPage() {
  return (
    <Suspense fallback={null}>
      <PhotosContent />
    </Suspense>
  );
}
