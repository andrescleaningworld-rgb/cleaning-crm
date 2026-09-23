"use client";

// Equipment Check tablet app (docs/equipment-check-spec.md). Shared company
// tablets, nobody stays signed in: name -> PIN (or "Create your PIN") ->
// what did you use -> how did you leave it -> (photos/notes) -> SEND ->
// "Done!" -> signed out -> back to the name grid. Also signs out after 2
// minutes with no taps.
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PinKeypad from "@/app/components/PinKeypad";
import LangToggle from "@/app/team-hub/[token]/LangToggle";
import { useTeamHubLang, type TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { resizeImageForUpload } from "@/lib/imageResize";
import { equipmentCheckStrings, INSTALL_STEPS, type InstallPlatform } from "../strings";

type Person = { staffId: string; name: string; isNew: boolean };
type EquipmentCard = { id: string; name: string; tag: string; photoUrl: string };
type Condition = "good" | "damaged" | "lost";
type Photo = { blob: Blob; previewUrl: string };

type Screen =
  | { kind: "people" }
  | { kind: "pin"; person: Person }
  | { kind: "create"; person: Person; firstPin: string | null }
  | { kind: "equipment" }
  | { kind: "condition"; item: EquipmentCard }
  | { kind: "details"; item: EquipmentCard; condition: Exclude<Condition, "good"> }
  | { kind: "done" };

const IDLE_SIGN_OUT_MS = 2 * 60 * 1000;
const DONE_SCREEN_MS = 3000;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function useEquipmentCheckManifestLink(key: string) {
  useEffect(() => {
    if (!key) return;
    const href = `/equipment-check/manifest.webmanifest?key=${encodeURIComponent(key)}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"][data-equipment-check]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      link.setAttribute("data-equipment-check", "true");
      document.head.appendChild(link);
    }
    link.href = href;
  }, [key]);
}

export default function EquipmentCheckPage() {
  const params = useParams();
  const key = Array.isArray(params.key) ? params.key[0] : (params.key ?? "");
  const apiBase = `/api/equipment-check/${encodeURIComponent(key)}`;

  useEquipmentCheckManifestLink(key);
  const [lang, setLang] = useTeamHubLang();
  const s = equipmentCheckStrings(lang);

  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [screen, setScreen] = useState<Screen>({ kind: "people" });
  const [signedInName, setSignedInName] = useState("");
  const [notice, setNotice] = useState("");
  // Only true when this browser also has a manager/owner login — shows
  // "Exit to Equipment". Employees never see it.
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/manager`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { isManager?: boolean }) => {
        if (!cancelled) setIsManager(data.isManager === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch(apiBase, { cache: "no-store" });
      const data = (await res.json()) as { active?: boolean; people?: Person[] };
      setActive(data.active !== false);
      setPeople(data.people ?? []);
    } catch {
      setNotice(s.noSignal);
    } finally {
      setLoading(false);
    }
  }, [apiBase, s.noSignal]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const signOut = useCallback(
    async (message = "") => {
      setScreen({ kind: "people" });
      setSignedInName("");
      setNotice(message);
      try {
        await fetch(`${apiBase}/session`, { method: "DELETE" });
      } catch {
        // cookie also expires on its own server-side
      }
      loadPeople();
    },
    [apiBase, loadPeople]
  );

  // 2 minutes with no taps anywhere -> back to the name grid, signed out.
  const screenKind = screen.kind;
  useEffect(() => {
    if (screenKind === "people" || screenKind === "done") return;
    let timer = window.setTimeout(() => signOut(), IDLE_SIGN_OUT_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => signOut(), IDLE_SIGN_OUT_MS);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [screenKind, signOut]);

  // "Done! Thank you" -> already signed out -> name grid after 3 seconds.
  useEffect(() => {
    if (screenKind !== "done") return;
    const timer = window.setTimeout(() => setScreen({ kind: "people" }), DONE_SCREEN_MS);
    return () => window.clearTimeout(timer);
  }, [screenKind]);

  const finishReport = useCallback(async () => {
    setScreen({ kind: "done" });
    setSignedInName("");
    try {
      await fetch(`${apiBase}/session`, { method: "DELETE" });
    } catch {
      // cookie also expires on its own server-side
    }
    loadPeople();
  }, [apiBase, loadPeople]);

  function onSignedIn(name: string) {
    setSignedInName(name);
    setNotice("");
    setScreen({ kind: "equipment" });
  }

  const signedIn = screen.kind === "equipment" || screen.kind === "condition" || screen.kind === "details";

  // "← Back" = previous step; "Home" = cancel the report, sign out, back to
  // the name grid (nothing is saved). Going back from the equipment grid
  // leaves the person's session, so it signs out too.
  function goBack() {
    switch (screen.kind) {
      case "pin":
        setScreen({ kind: "people" });
        return;
      case "create":
        if (screen.firstPin !== null) setScreen({ kind: "create", person: screen.person, firstPin: null });
        else setScreen({ kind: "people" });
        return;
      case "equipment":
        signOut();
        return;
      case "condition":
        setScreen({ kind: "equipment" });
        return;
      case "details":
        setScreen({ kind: "condition", item: screen.item });
        return;
    }
  }
  const showStepNav = screen.kind !== "people" && screen.kind !== "done";

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <header className="flex items-center justify-between gap-3 bg-blue-700 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-xl font-bold">{s.title}</p>
          {signedIn && signedInName && <p className="truncate text-base text-blue-100">{signedInName}</p>}
        </div>
        <div className="flex items-center gap-3">
          {isManager && (
            <Link href="/equipment" className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white active:bg-white/25">
              Exit to Equipment
            </Link>
          )}
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>

      <main className="flex-1 p-4">
        <InstallBanner lang={lang} />
        {showStepNav && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={goBack}
              className="min-h-[64px] rounded-2xl bg-white text-2xl font-bold text-blue-700 shadow-sm active:bg-gray-100"
            >
              ← {s.back}
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="min-h-[64px] rounded-2xl bg-white text-2xl font-bold text-slate-700 shadow-sm active:bg-gray-100"
            >
              🏠 {s.home}
            </button>
          </div>
        )}
        {notice && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-lg font-semibold text-amber-900">
            {notice}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-center text-xl text-slate-500">{s.loading}</p>
        ) : !active ? (
          <p className="mt-10 text-center text-xl font-semibold text-slate-700">{s.linkNotActive}</p>
        ) : screen.kind === "people" ? (
          <PeopleGrid
            people={people}
            s={s}
            onPick={(person) => {
              setNotice("");
              setScreen(person.isNew ? { kind: "create", person, firstPin: null } : { kind: "pin", person });
            }}
          />
        ) : screen.kind === "pin" ? (
          <PinScreen
            apiBase={apiBase}
            person={screen.person}
            s={s}
            onSignedIn={onSignedIn}
          />
        ) : screen.kind === "create" ? (
          <CreatePinScreen
            key={screen.firstPin === null ? "first" : "confirm"}
            apiBase={apiBase}
            person={screen.person}
            firstPin={screen.firstPin}
            s={s}
            onFirstPin={(pin) => setScreen({ kind: "create", person: screen.person, firstPin: pin })}
            onMismatch={() => {
              setNotice(s.pinMismatch);
              setScreen({ kind: "create", person: screen.person, firstPin: null });
            }}
            onSignedIn={onSignedIn}
          />
        ) : screen.kind === "equipment" ? (
          <EquipmentGrid
            apiBase={apiBase}
            s={s}
            onExpired={() => signOut(s.signedOut)}
            onPick={(item) => setScreen({ kind: "condition", item })}
          />
        ) : screen.kind === "condition" ? (
          <ConditionScreen
            apiBase={apiBase}
            item={screen.item}
            s={s}
            onExpired={() => signOut(s.signedOut)}
            onPickProblem={(condition) => setScreen({ kind: "details", item: screen.item, condition })}
            onSent={finishReport}
          />
        ) : screen.kind === "details" ? (
          <DetailsScreen
            apiBase={apiBase}
            item={screen.item}
            condition={screen.condition}
            s={s}
            onExpired={() => signOut(s.signedOut)}
            onSent={finishReport}
          />
        ) : (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <span className="text-8xl">✅</span>
            <p className="text-4xl font-bold text-green-700">{s.done}</p>
          </div>
        )}
      </main>
    </div>
  );
}

const INSTALL_HINT_DISMISSED_KEY = "equipment-check-install-hint-dismissed";

function isRunningStandalone(): boolean {
  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mediaStandalone || iosStandalone;
}

function detectInstallPlatform(): InstallPlatform {
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS Safari reports itself as a Mac; a touch screen gives it away.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

// First time the app is opened in a plain browser tab (not from the Home
// Screen): a dismissible banner with that device's Add to Home Screen
// steps. Dismissal is remembered on this device (best-effort storage).
function InstallBanner({ lang }: { lang: TeamHubLang }) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  useEffect(() => {
    if (isRunningStandalone()) return;
    try {
      if (localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "1") return;
    } catch {
      // storage blocked — still show the hint
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only checks, can't run during SSR
    setPlatform(detectInstallPlatform());
  }, []);

  if (!platform) return null;
  const steps = INSTALL_STEPS[lang];

  function dismiss() {
    setPlatform(null);
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "1");
    } catch {
      // best-effort only
    }
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
      <div>
        <p className="text-lg font-bold">📲 {steps.title}</p>
        {steps.byPlatform[platform].map((step) => (
          <p key={step} className="text-base">
            {step}
          </p>
        ))}
      </div>
      <button type="button" onClick={dismiss} className="shrink-0 rounded-xl bg-blue-700 px-4 py-2 text-base font-bold text-white active:bg-blue-800">
        {steps.gotIt}
      </button>
    </div>
  );
}

type Strings = ReturnType<typeof equipmentCheckStrings>;

function PeopleGrid({ people, s, onPick }: { people: Person[]; s: Strings; onPick: (person: Person) => void }) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-slate-900">{s.whoAreYou}</h1>
      {people.length === 0 ? (
        <p className="text-xl text-slate-500">{s.noPeople}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {people.map((person) => (
            <button
              key={person.staffId}
              type="button"
              onClick={() => onPick(person)}
              className="relative min-h-[88px] rounded-2xl bg-white px-3 text-2xl font-bold text-slate-800 shadow-sm active:bg-gray-100"
            >
              {person.name}
              {person.isNew && (
                <span className="absolute right-2 top-2 rounded-full bg-green-600 px-2 py-0.5 text-sm font-bold text-white">
                  {s.newBadge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function usePinEntry(onComplete: (pin: string) => void, busy: boolean) {
  const [pin, setPin] = useState("");
  const tapDigit = (digit: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) onComplete(next);
  };
  const backspace = () => {
    if (!busy) setPin((current) => current.slice(0, -1));
  };
  return { pin, setPin, tapDigit, backspace };
}

function PinScreen({
  apiBase,
  person,
  s,
  onSignedIn,
}: {
  apiBase: string;
  person: Person;
  s: Strings;
  onSignedIn: (name: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (pin: string) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: person.staffId, pin }),
      });
      const data = (await res.json()) as { success?: boolean; name?: string };
      if (!res.ok || !data.success) {
        setError(res.status === 423 ? s.lockedOut : res.status === 401 ? s.wrongPin : s.somethingWrong);
        entry.setPin("");
        navigator.vibrate?.([15, 40, 15]);
        return;
      }
      navigator.vibrate?.(15);
      onSignedIn(data.name ?? person.name);
    } catch {
      setError(s.noSignal);
      entry.setPin("");
    } finally {
      setSubmitting(false);
    }
  };
  const entry = usePinEntry(submit, submitting);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          {s.enterPin}, {person.name}
        </h1>
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-lg font-semibold text-red-800">{error}</div>}
      <PinKeypad
        pinLength={entry.pin.length}
        disabled={submitting}
        onDigit={entry.tapDigit}
        onBackspace={entry.backspace}
        onSubmit={() => submit(entry.pin)}
      />
    </div>
  );
}

function CreatePinScreen({
  apiBase,
  person,
  firstPin,
  s,
  onFirstPin,
  onMismatch,
  onSignedIn,
}: {
  apiBase: string;
  person: Person;
  firstPin: string | null;
  s: Strings;
  onFirstPin: (pin: string) => void;
  onMismatch: () => void;
  onSignedIn: (name: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const complete = async (pin: string) => {
    if (firstPin === null) {
      onFirstPin(pin);
      return;
    }
    if (pin !== firstPin) {
      onMismatch();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/pin-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: person.staffId, pin: firstPin, pinConfirm: pin }),
      });
      const data = (await res.json()) as { success?: boolean; name?: string };
      if (!res.ok || !data.success) {
        setError(res.status === 409 ? s.setupClosed : s.somethingWrong);
        entry.setPin("");
        return;
      }
      navigator.vibrate?.(15);
      onSignedIn(data.name ?? person.name);
    } catch {
      setError(s.noSignal);
      entry.setPin("");
    } finally {
      setSubmitting(false);
    }
  };
  const entry = usePinEntry(complete, submitting);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {firstPin === null ? s.createPin : s.confirmPin}, {person.name}
          </h1>
          {firstPin === null && <p className="mt-1 text-lg text-slate-500">{s.createPinHint}</p>}
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-lg font-semibold text-red-800">{error}</div>}
      <PinKeypad
        pinLength={entry.pin.length}
        disabled={submitting}
        onDigit={entry.tapDigit}
        onBackspace={entry.backspace}
        onSubmit={() => complete(entry.pin)}
      />
    </div>
  );
}

function EquipmentGrid({
  apiBase,
  s,
  onExpired,
  onPick,
}: {
  apiBase: string;
  s: Strings;
  onExpired: () => void;
  onPick: (item: EquipmentCard) => void;
}) {
  const [items, setItems] = useState<EquipmentCard[] | null>(null);
  const [error, setError] = useState("");
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/equipment`, { cache: "no-store" });
        if (res.status === 401) {
          onExpiredRef.current();
          return;
        }
        const data = (await res.json()) as { success?: boolean; equipment?: EquipmentCard[] };
        if (!cancelled) {
          if (data.success) setItems(data.equipment ?? []);
          else setError(s.somethingWrong);
        }
      } catch {
        if (!cancelled) setError(s.noSignal);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, s.somethingWrong, s.noSignal]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-slate-900">{s.whatDidYouUse}</h1>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-lg font-semibold text-red-800">{error}</div>}
      {items === null && !error ? (
        <p className="text-xl text-slate-500">{s.loading}</p>
      ) : items && items.length === 0 ? (
        <p className="text-xl text-slate-500">{s.noEquipment}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(items ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              className="flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm active:bg-gray-100"
            >
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Sheets-hosted URLs of any origin
                <img src={item.photoUrl} alt="" className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-slate-200 text-5xl">🧰</div>
              )}
              <div className="p-3">
                {item.tag && <p className="text-3xl font-black text-slate-900">{item.tag}</p>}
                <p className={item.tag ? "text-lg font-semibold text-slate-600" : "text-2xl font-bold text-slate-900"}>{item.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function sendReport(
  apiBase: string,
  equipmentId: string,
  condition: Condition,
  notes: string,
  photos: Photo[]
): Promise<"ok" | "expired" | "error" | "offline"> {
  const form = new FormData();
  form.append("equipmentId", equipmentId);
  form.append("condition", condition);
  if (notes.trim()) form.append("notes", notes.trim());
  photos.forEach((photo, i) => form.append("photos", photo.blob, `photo-${i + 1}.jpg`));
  try {
    const res = await fetch(`${apiBase}/reports`, { method: "POST", body: form });
    if (res.status === 401) return "expired";
    const data = (await res.json()) as { success?: boolean };
    return res.ok && data.success ? "ok" : "error";
  } catch {
    return "offline";
  }
}

function ConditionScreen({
  apiBase,
  item,
  s,
  onExpired,
  onPickProblem,
  onSent,
}: {
  apiBase: string;
  item: EquipmentCard;
  s: Strings;
  onExpired: () => void;
  onPickProblem: (condition: Exclude<Condition, "good">) => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Green submits immediately — no notes/Send screen.
  const sendGood = async () => {
    setSending(true);
    setError("");
    const result = await sendReport(apiBase, item.id, "good", "", []);
    setSending(false);
    if (result === "ok") onSent();
    else if (result === "expired") onExpired();
    else setError(result === "offline" ? s.noSignal : s.somethingWrong);
  };

  return (
    <div className="space-y-4">
      <p className="text-xl font-semibold text-slate-600">
        {item.tag ? `${item.tag} · ` : ""}
        {item.name}
      </p>
      <h1 className="text-3xl font-bold text-slate-900">{s.howDidYouLeaveIt}</h1>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-lg font-semibold text-red-800">{error}</div>}
      <div className="grid gap-3">
        <button
          type="button"
          onClick={sendGood}
          disabled={sending}
          className="flex min-h-[110px] items-center justify-center gap-4 rounded-2xl bg-green-600 text-3xl font-bold text-white shadow-sm active:bg-green-700 disabled:opacity-60"
        >
          <span className="text-5xl">👍</span>
          {sending ? s.sending : s.good}
        </button>
        <button
          type="button"
          onClick={() => onPickProblem("damaged")}
          disabled={sending}
          className="flex min-h-[110px] items-center justify-center gap-4 rounded-2xl bg-yellow-400 px-3 text-3xl font-bold text-slate-900 shadow-sm active:bg-yellow-500 disabled:opacity-60"
        >
          <span className="text-5xl">⚠️</span>
          {s.damaged}
        </button>
        <button
          type="button"
          onClick={() => onPickProblem("lost")}
          disabled={sending}
          className="flex min-h-[110px] items-center justify-center gap-4 rounded-2xl bg-red-600 text-3xl font-bold text-white shadow-sm active:bg-red-700 disabled:opacity-60"
        >
          <span className="text-5xl">❓</span>
          {s.lost}
        </button>
      </div>
    </div>
  );
}

function DetailsScreen({
  apiBase,
  item,
  condition,
  s,
  onExpired,
  onSent,
}: {
  apiBase: string;
  item: EquipmentCard;
  condition: Exclude<Condition, "good">;
  s: Strings;
  onExpired: () => void;
  onSent: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  });
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  const photoRequired = condition === "damaged";
  const canSend = !sending && (!photoRequired || photos.length > 0);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError("");
    const room = MAX_PHOTOS - photos.length;
    const added: Photo[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const { blob } = await resizeImageForUpload(file);
      if (blob.size > MAX_PHOTO_BYTES) {
        setError(s.photoTooBig);
        continue;
      }
      added.push({ blob, previewUrl: URL.createObjectURL(blob) });
    }
    setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    const result = await sendReport(apiBase, item.id, condition, notes, photos);
    setSending(false);
    if (result === "ok") onSent();
    else if (result === "expired") onExpired();
    else setError(result === "offline" ? s.noSignal : s.somethingWrong);
  }

  const conditionBanner =
    condition === "damaged" ? (
      <div className="rounded-2xl bg-yellow-400 px-4 py-3 text-2xl font-bold text-slate-900">⚠️ {s.damaged}</div>
    ) : (
      <div className="rounded-2xl bg-red-600 px-4 py-3 text-2xl font-bold text-white">❓ {s.lost}</div>
    );

  return (
    <div className="space-y-4">
      <p className="text-xl font-semibold text-slate-600">
        {item.tag ? `${item.tag} · ` : ""}
        {item.name}
      </p>
      {conditionBanner}

      {photos.length < MAX_PHOTOS && (
        <label className="flex min-h-[110px] cursor-pointer items-center justify-center gap-4 rounded-2xl bg-blue-700 text-3xl font-bold text-white shadow-sm active:bg-blue-800">
          <span className="text-5xl">📷</span>
          {s.takePicture}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <p className={`text-lg font-semibold ${photoRequired && photos.length === 0 ? "text-amber-700" : "text-slate-500"}`}>
        {photoRequired && photos.length === 0 ? s.photoRequired : s.photoCount(photos.length)}
      </p>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, i) => (
            <div key={photo.previewUrl} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={photo.previewUrl} alt="" className="h-28 w-full rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label="Remove"
                className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-xl font-bold text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={s.notesPlaceholder}
        rows={3}
        maxLength={2000}
        className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-xl text-slate-900 outline-none focus:border-blue-600"
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-lg font-semibold text-red-800">{error}</div>}

      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        className="min-h-[96px] w-full rounded-2xl bg-green-600 text-4xl font-black text-white shadow-sm active:bg-green-700 disabled:opacity-40"
      >
        {sending ? s.sending : s.send}
      </button>
    </div>
  );
}
