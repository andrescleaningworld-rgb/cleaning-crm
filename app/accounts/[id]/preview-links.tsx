"use client";

// Account page -> More: the shared preview links of this account
// (lib/portalPreviewLink.ts). "Preview links: active" with who made the last
// one and when it was last opened, and Turn off: every link of this account
// stops working at once. Links are made from the View as customer bar.

import { useCallback, useEffect, useState } from "react";
import { BigButton, showToast } from "@/app/ui";

type Status = { active: number; lastMade: { by: string; at: string } | null; lastOpened: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function PreviewLinks({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/portal-preview-link?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean } & Status;
      if (data.success) setStatus({ active: data.active, lastMade: data.lastMade, lastOpened: data.lastOpened });
    } catch {
      // Only a status line: the rest of the page does not need it.
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function turnOff() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/portal-preview-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "off", accountId }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string } & Status;
      if (!data.success) throw new Error(data.error || "That did not work. Try again.");
      setStatus({ active: data.active, lastMade: data.lastMade, lastOpened: data.lastOpened });
      showToast("Preview links turned off ✓");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not work. Try again.", "bad");
    } finally {
      setBusy(false);
    }
  }

  if (!status || (!status.active && !status.lastMade)) return null;
  const facts = [status.lastMade ? `last made by ${status.lastMade.by || "someone"} on ${day(status.lastMade.at)}` : "", status.lastOpened ? `last opened ${day(status.lastOpened)}` : "never opened"].filter(Boolean).join(" · ");
  return (
    <div className="ui-stack" data-preview-links>
      <p className="ui-card-text">
        <strong>Preview links: {status.active ? "active" : "off"}</strong>
        {facts ? ` · ${facts}` : ""}
      </p>
      {status.active ? (
        <BigButton kind="second" busy={busy} busyLabel="Turning off…" onClick={() => void turnOff()}>
          Turn off preview links
        </BigButton>
      ) : null}
    </div>
  );
}
