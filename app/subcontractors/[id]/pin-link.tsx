"use client";

// Staff: "Text the PIN setup link" on a subcontractor's page. Makes the sub's
// personal link and texts it to the phone on file. Outside production the
// link is shown on screen instead (no real text goes out there). Shows
// nothing where PIN login is not turned on.

import { useEffect, useState } from "react";
import { BigButton, ErrorBox, Sheet } from "@/app/ui";

export default function PinLinkButton({ email, name }: { email: string; name: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ texted: boolean; hasPhone: boolean; days: number; devLink?: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/sub-pin-link", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { on?: boolean }) => setOn(data.on === true))
      .catch(() => setOn(false));
  }, []);

  if (!on) return null;

  async function send() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/sub-pin-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; texted?: boolean; hasPhone?: boolean; days?: number; devLink?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "The link was not made. Try again.");
      setResult({ texted: data.texted === true, hasPhone: data.hasPhone === true, days: data.days ?? 7, devLink: data.devLink });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The link was not made. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sub-detail-print-hide">
      <BigButton kind="second" busy={busy} busyLabel="Sending…" disabled={!email} onClick={() => void send()}>
        Text the PIN setup link
      </BigButton>
      {!email ? <p className="ui-muted">Add this sub&apos;s email first.</p> : null}
      {error ? <ErrorBox title="Not sent." text={error} onRetry={() => void send()} /> : null}
      <Sheet
        open={result !== null}
        title={result?.texted ? "Link sent ✓" : "Link made"}
        text={
          result
            ? result.texted
              ? `${name} got a text with a personal link. They tap it and pick a 4-digit PIN. The link works once, for ${result.days} days.`
              : result.hasPhone
                ? "The text did not go out. You can try again."
                : "This sub has no phone number on file, so no text was sent. Add the phone and try again."
            : undefined
        }
        onClose={() => setResult(null)}
      >
        {result?.devLink ? (
          <div className="ui-stack">
            <p>This is not the live site, so no real text goes out. This is the link the text would carry:</p>
            <p className="ui-code">{result.devLink}</p>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
