"use client";

import { useState } from "react";
import { BigButton, Card, ErrorBox, Field, Screen } from "@/app/ui";
import { LangToggle, usePortalWords } from "../portal-ui";

export default function LinkRequestForm({ first }: { first: boolean }) {
  const words = usePortalWords();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return setError(words.needEmail);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), kind: first ? "set" : "reset" }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; devLink?: string };
      if (!res.ok || !data.success) {
        setError(data.error === "email" ? words.needEmail : words.somethingWrong);
        return;
      }
      setDevLink(data.devLink ?? "");
      setSent(true);
    } catch {
      setError(words.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen title={words.linkSentTitle} subtitle={words.linkSentText} backHref="/portal/login" headerRight={<LangToggle />}>
        {devLink ? (
          <Card title={words.testLinkTitle}>
            <p>{words.testLinkText}</p>
            <p className="ui-code">{devLink}</p>
            <a href={devLink} className="ui-btn ui-btn-main">
              {words.openLink}
            </a>
          </Card>
        ) : null}
        <a href="/portal/login" className="ui-btn ui-btn-second">
          {words.backToLogin}
        </a>
      </Screen>
    );
  }

  return (
    <Screen title={first ? words.firstTitle : words.forgotTitle} subtitle={first ? words.firstText : words.forgotText} backHref="/portal/login" headerRight={<LangToggle />}>
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
        {error ? <ErrorBox title={error} /> : null}
        <div className="ui-actionbar">
          <BigButton type="submit" busy={busy} busyLabel={words.sending}>
            {words.sendLink}
          </BigButton>
        </div>
      </form>
    </Screen>
  );
}
