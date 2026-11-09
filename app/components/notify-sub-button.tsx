"use client";

// "Notify sub" for one complaint, where there is no room for the full card
// (the Pin Board popup): the email + text to the account's sub, "Last
// notified: …" next to it, and "Send again?" right there when it was already
// sent. The Complaint Detail page has its own copy with the full list.

import { useEffect, useState } from "react";
import { BigButton, showToast } from "@/app/ui";

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** complaintKey: the Complaint ID (or row number / internal key) as in /complaints/<key>. */
export default function NotifySubButton({ complaintKey }: { complaintKey: string }) {
  const [lastNotified, setLastNotified] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/complaints/${encodeURIComponent(complaintKey)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { subNotices?: { status: string; at: string }[] }) => {
        if (alive) setLastNotified(data.subNotices?.find((notice) => notice.status === "sent")?.at ?? "");
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [complaintKey]);

  async function send() {
    setBusy(true);
    setAsking(false);
    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notifySub", complaint: { id: complaintKey } }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; result?: { email: string; text: string; subName: string; reasons: string[] } };
      if (!response.ok || data.success !== true || !data.result) throw new Error(data.error || "The notice was not sent.");
      const { email, text, subName, reasons } = data.result;
      const parts = [email === "sent" ? "email" : "", text === "sent" ? "text" : ""].filter(Boolean);
      if (parts.length > 0) {
        setLastNotified(new Date().toISOString());
        showToast(`${subName || "The sub"} notified by ${parts.join(" and ")}.`);
      } else {
        showToast(`Not sent: ${reasons.join(" ") || "unknown reason."}`, "bad");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The notice was not sent.", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack">
      {asking ? (
        <>
          <p className="ui-strong">Send again? Last notified {formatWhen(lastNotified)}.</p>
          <BigButton busy={busy} busyLabel="Sending…" onClick={() => void send()}>
            Yes, send again
          </BigButton>
          <BigButton kind="quiet" onClick={() => setAsking(false)}>
            Cancel
          </BigButton>
        </>
      ) : (
        <>
          <BigButton kind="second" busy={busy} busyLabel="Sending…" onClick={() => (lastNotified ? setAsking(true) : void send())}>
            Notify sub
          </BigButton>
          <p className="ui-muted">{lastNotified ? `Last notified: ${formatWhen(lastNotified)}` : "Not notified yet."}</p>
        </>
      )}
    </div>
  );
}
