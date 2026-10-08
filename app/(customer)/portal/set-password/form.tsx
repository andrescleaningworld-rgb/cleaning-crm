"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton, ErrorBox, Screen } from "@/app/ui";
import { LangToggle, PasswordField, usePortalWords } from "../portal-ui";

export default function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const words = usePortalWords();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) return setError(words.passwordShort);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; needsLocation?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error === "short" ? words.passwordShort : data.error === "link" ? words.linkBadText : words.somethingWrong);
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
    <Screen title={words.chooseTitle} subtitle={words.chooseText(email)} headerRight={<LangToggle />}>
      <form onSubmit={handleSubmit} className="ui-stack" noValidate>
        {/* Lets a password manager file the new password under the right email. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <PasswordField id="portal-new-password" label={words.newPassword} hint={words.passwordHint} value={password} onChange={setPassword} autoComplete="new-password" />
        {error ? <ErrorBox title={error} /> : null}
        <div className="ui-actionbar">
          <BigButton type="submit" busy={busy} busyLabel={words.saving}>
            {words.savePassword}
          </BigButton>
        </div>
      </form>
    </Screen>
  );
}
