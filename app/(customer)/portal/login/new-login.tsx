"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton, ErrorBox, Field, Screen } from "@/app/ui";
import { LangToggle, PasswordField, usePortalWords } from "../portal-ui";

export default function NewPortalLogin() {
  const words = usePortalWords();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return setError(words.needEmail);
    if (!password) return setError(words.needPassword);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; needsLocation?: boolean; error?: string; minutesLeft?: number };
      if (!res.ok || !data.success) {
        setError(data.error === "locked" ? words.locked(data.minutesLeft ?? 15) : data.error === "wrong" ? words.wrongLogin : words.somethingWrong);
        return;
      }
      router.push(data.needsLocation ? "/portal/locations" : "/portal");
      router.refresh();
    } catch {
      setError(words.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={words.loginTitle} subtitle={words.loginText} headerRight={<LangToggle />}>
      <div className="ui-portal-brand">
        <Image src="/logo-CW-single-phone-optimized.png" alt="" width={64} height={64} priority />
        <p className="ui-strong">{words.brand}</p>
      </div>

      <form onSubmit={handleSubmit} className="ui-stack" noValidate>
        <Field
          id="portal-email"
          label={words.email}
          hint={words.emailHint}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField id="portal-password" label={words.password} value={password} onChange={setPassword} autoComplete="current-password" />

        {error ? <ErrorBox title={error} /> : null}

        <div className="ui-actionbar">
          <BigButton type="submit" busy={busy} busyLabel={words.loggingIn}>
            {words.logIn}
          </BigButton>
        </div>
      </form>

      <div className="ui-stack">
        <Link href="/portal/forgot?first=1" className="ui-btn ui-btn-second">
          {words.firstTime}
        </Link>
        <Link href="/portal/forgot" className="ui-link">
          {words.forgot}
        </Link>
      </div>
    </Screen>
  );
}
