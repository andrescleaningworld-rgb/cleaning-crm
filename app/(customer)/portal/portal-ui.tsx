"use client";

// Client pieces every screen of the new customer portal shares: the words
// in the chosen language, the language button, log out, and the big tiles.

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UiWordsProvider } from "@/app/ui";
import { PORTAL_LANG_COOKIE, PORTAL_WORDS, type PortalLang, type PortalWords } from "./words";

const LangContext = createContext<PortalLang>("en");

export function PortalLangProvider({ lang, children }: { lang: PortalLang; children: ReactNode }) {
  return (
    <LangContext.Provider value={lang}>
      <UiWordsProvider lang={lang}>{children}</UiWordsProvider>
    </LangContext.Provider>
  );
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

/** One big button of the home screen: a picture, a few words, one tap. */
export function PortalTile({ href, icon, label, detail }: { href: string; icon: string; label: string; detail?: string }) {
  return (
    <Link href={href} className="ui-tile">
      <span className="ui-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ui-tile-words">
        <span className="ui-tile-label">{label}</span>
        {detail ? <span className="ui-tile-detail">{detail}</span> : null}
      </span>
    </Link>
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
