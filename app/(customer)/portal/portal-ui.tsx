"use client";

// Client pieces every screen of the new customer portal shares: the words
// in the chosen language, the language button, log out, and the big tiles.

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UiWordsProvider } from "@/app/ui";
import { PORTAL_LANG_COOKIE, PORTAL_WORDS, type PortalLang, type PortalWords } from "./words";
import type { PortalComplaintFix } from "@/lib/pg/portal-home";
import PizzaTracker, { type TrackerView } from "@/app/components/pizza-tracker";
import { customerSteps } from "@/lib/complaintSteps";

const LangContext = createContext<PortalLang>("en");

/** Staff "View as customer" (lib/portalPreview.ts): the account being viewed, or null for a real customer. */
export type PortalPreviewInfo = { accountId: string; accountName: string; shared: boolean } | null;
const PreviewContext = createContext<PortalPreviewInfo>(null);

/** The words staff see on a button that would send something during a preview. */
export const PREVIEW_ONLY = "Preview only, nothing is sent";

export function PortalLangProvider({ lang, preview = null, children }: { lang: PortalLang; preview?: PortalPreviewInfo; children: ReactNode }) {
  return (
    <LangContext.Provider value={lang}>
      <PreviewContext.Provider value={preview}>
        <UiWordsProvider lang={lang}>{children}</UiWordsProvider>
      </PreviewContext.Provider>
    </LangContext.Provider>
  );
}

/** Non-null while staff view the portal as a customer: every Send / Save is off. */
export function usePortalPreview(): PortalPreviewInfo {
  return useContext(PreviewContext);
}

export function usePortalLang(): PortalLang {
  return useContext(LangContext);
}

export function usePortalWords(): PortalWords {
  return PORTAL_WORDS[useContext(LangContext)];
}

/** English ⇄ Español. The choice is kept on this device for a year. */
export function LangToggle() {
  const lang = usePortalLang();
  const words = usePortalWords();
  const router = useRouter();
  return (
    <button
      type="button"
      className="ui-btn ui-btn-second"
      lang={lang === "en" ? "es" : "en"}
      onClick={() => {
        document.cookie = `${PORTAL_LANG_COOKIE}=${lang === "en" ? "es" : "en"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        router.refresh();
      }}
    >
      {words.language}
    </button>
  );
}

export function PortalLogoutButton() {
  const words = usePortalWords();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // A preview has no customer session to end. Staff end the preview; a shared link has nothing to end.
  const preview = usePortalPreview();
  if (preview?.shared) return null;
  if (preview) {
    return (
      <a className="ui-btn ui-btn-second" href="/api/admin/portal-preview?exit=1">
        Exit preview
      </a>
    );
  }
  return (
    <button
      type="button"
      className="ui-btn ui-btn-second"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/portal/auth/logout", { method: "POST" }).catch(() => null);
        router.push("/portal/login");
        router.refresh();
      }}
    >
      {words.logOut}
    </button>
  );
}

/** One of the four giant buttons of the home screen: a big picture over a few words. */
export function PortalBigTile({ href, icon, label, tip }: { href: string; icon: string; label: string; tip?: string }) {
  return (
    <Link href={href} className="ui-portal-tile" data-tip={tip}>
      <span className="ui-portal-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ui-portal-tile-label">{label}</span>
    </Link>
  );
}

/**
 * Where something the customer sent stands: Received (blue), In progress (yellow), Done (green).
 * A tracked problem (`track`) says its tracker step in short: Received / Team on it / Fixed.
 */
export function PortalStatus({ state, problem = false, track }: { state: "received" | "working" | "done"; problem?: boolean; track?: TrackerView }) {
  const words = usePortalWords();
  const label = track ? words.trackShort[track.index] : (problem ? words.problemSteps : words.states)[state];
  return <span className={`ui-portal-status ui-portal-status-${state}`}>{label}</span>;
}

/** "Nov 10, 3:42 PM" / "10 nov, 3:42 p. m.", office time. */
function trackTime(iso: string, lang: PortalLang): string {
  const day = new Date(iso);
  if (!iso || Number.isNaN(day.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(day);
}

/**
 * A fixed problem: "How we fixed it", when, what was done, and the after
 * photos. A tap on a photo opens it full screen (Back / Next / Close).
 */
export function ComplaintFix({ fix }: { fix: PortalComplaintFix }) {
  const words = usePortalWords();
  const lang = usePortalLang();
  const [open, setOpen] = useState<number | null>(null);
  const when = trackTime(fix.at, lang);
  const count = fix.photos.length;
  const show = (index: number) => setOpen(((index % count) + count) % count);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      else if (event.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % count));
      else if (event.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + count) % count));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, count]);

  return (
    <section className="ui-portal-fix" aria-label={words.fixTitle}>
      <h3 className="ui-portal-fix-title">✅ {words.fixTitle}</h3>
      {when ? (
        <p className="ui-portal-fix-when" suppressHydrationWarning>
          {words.fixedOn(when)}
        </p>
      ) : null}
      {fix.note ? <p className="ui-portal-fix-note">{fix.note}</p> : null}
      {count > 0 ? (
        <>
          <p className="ui-muted">{words.fixPhotos(count)}</p>
          <div className="ui-portal-fix-photos">
            {fix.photos.map((url, index) => (
              <button key={url} type="button" className="ui-portal-fix-thumb" onClick={() => show(index)} aria-label={words.fixPhotoAlt(index + 1, count)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </>
      ) : null}
      {open !== null ? (
        <div className="ui-portal-viewer" role="dialog" aria-modal="true" aria-label={words.fixPhotoAlt(open + 1, count)} onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fix.photos[open]} alt={words.fixPhotoAlt(open + 1, count)} onClick={(event) => event.stopPropagation()} />
          <div className="ui-portal-viewer-bar" onClick={(event) => event.stopPropagation()}>
            {count > 1 ? (
              <button type="button" className="ui-btn ui-btn-second" onClick={() => show(open - 1)}>
                {words.photoPrev}
              </button>
            ) : null}
            <button type="button" className="ui-btn ui-btn-main" onClick={() => setOpen(null)} autoFocus>
              {words.photoClose}
            </button>
            {count > 1 ? (
              <button type="button" className="ui-btn ui-btn-second" onClick={() => show(open + 1)}>
                {words.photoNext}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * A problem's pizza tracker (the shared one, app/components/pizza-tracker.tsx):
 * a thick bar, then the 3 steps one per line, with when each was reached.
 * Received → Team on it → Fixed. Never a name, never red.
 */
export function ComplaintTracker({ track }: { track: TrackerView }) {
  const words = usePortalWords();
  const lang = usePortalLang();
  const view = { ...track, now: words.trackSteps[track.index] ?? "" };
  return (
    <div className="ui-portal-track" role="group" aria-label={`${words.trackLabel}: ${view.now}`}>
      <PizzaTracker view={view} size="pin" steps={customerSteps(words.trackSteps)} label={words.trackLabel} finish={words.trackSteps[2]} />
      <PizzaTracker view={view} size="list" steps={customerSteps(words.trackSteps)} label={words.trackLabel} finish={words.trackSteps[2]} formatWhen={(iso) => trackTime(iso, lang)} />
    </div>
  );
}

/** A password box with a show / hide eye button. */
export function PasswordField({
  id,
  label,
  hint,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const words = usePortalWords();
  const [shown, setShown] = useState(false);
  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-label">
        {label}
      </label>
      <div className="ui-password">
        <input
          id={id}
          className="ui-input"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="ui-btn ui-btn-second ui-btn-icon"
          aria-label={shown ? words.hidePassword : words.showPassword}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          <span aria-hidden="true">{shown ? "🙈" : "👁"}</span>
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="ui-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
