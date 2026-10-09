"use client";

// The page a subcontractor's personal link opens: pick a 4-digit PIN (typed
// twice). After that the phone asks only for the PIN for 90 days.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MOTTO, SUB_WORDS } from "@/app/ui/words";
import { ShellTitle } from "@/app/ui";
import { LangButton, PinPad, useSubLang } from "../simple-home";

function SetupContent() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [lang, nextLang] = useSubLang();
  const words = SUB_WORDS[lang];
  const [state, setState] = useState<"checking" | "ok" | "bad">("checking");
  const [firstName, setFirstName] = useState("");
  const [first, setFirst] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/subcontractor-portal/pin?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { on?: boolean; linkOk?: boolean; firstName?: string }) => {
        setFirstName(data.firstName ?? "");
        setState(data.on && data.linkOk ? "ok" : "bad");
      })
      .catch(() => setState("bad"));
  }, [token]);

  async function finish(pin: string) {
    if (!first) {
      setError("");
      setFirst(pin);
      return;
    }
    if (pin !== first) {
      setFirst("");
      setError(words.pinNoMatch);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/subcontractor-portal/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setup", token, pin }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || words.notSent);
      window.localStorage.setItem("cwRole", "subcontractor");
      router.replace("/subcontractor-portal");
    } catch (err) {
      setFirst("");
      setError(err instanceof Error ? err.message : words.notSent);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ui-screen">
      <ShellTitle title={firstName ? words.hello(firstName) : words.pinTitle} />
      <div className="ui-card-row">
        <p className="ui-motto">{MOTTO[lang]}</p>
        <LangButton lang={lang} onNext={nextLang} />
      </div>
      {state === "checking" ? (
        <p className="ui-muted">…</p>
      ) : state === "bad" ? (
        <div className="ui-errorbox" role="alert">
          <p className="ui-errorbox-title">This link no longer works.</p>
          <p>Ask your manager for a new one, or log in with your email.</p>
          <a className="ui-btn ui-btn-second" href="/subcontractor-portal">
            {words.useEmail}
          </a>
        </div>
      ) : (
        <PinPad key={first ? "again" : "new"} title={first ? words.pinAgain : words.pinNew} error={error} busy={busy} onDone={(pin) => void finish(pin)} />
      )}
    </main>
  );
}

export default function SubPinSetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupContent />
    </Suspense>
  );
}
