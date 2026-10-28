"use client";

// Client pieces every screen of the new customer portal shares: the words
// in the chosen language, the language button, log out, and the big tiles.

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UiWordsProvider } from "@/app/ui";
import { PORTAL_LANG_COOKIE, PORTAL_WORDS, type PortalLang, type PortalWords } from "./words";

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

/** Where something the customer sent stands: Received (blue), In progress (yellow), Done (green). */
export function PortalStatus({ state }: { state: "received" | "working" | "done" }) {
  const words = usePortalWords();
  return <span className={`ui-portal-status ui-portal-status-${state}`}>{words.states[state]}</span>;
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
