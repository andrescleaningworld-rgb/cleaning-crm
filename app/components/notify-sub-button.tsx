"use client";

// "Notify sub" for one complaint, where there is no room for the full card
// (the Pin Board popup): opens the same picker as the Complaint Detail page
// (Text / Email / WhatsApp / Copy / Text + Email, notify-sub-picker.tsx), with
// "Last notified: …" under the button.

import { useCallback, useEffect, useState } from "react";
import { BigButton, showToast } from "@/app/ui";
import NotifySubPicker from "./notify-sub-picker";

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** complaintKey: the Complaint ID (or row number / internal key) as in /complaints/<key>. */
export default function NotifySubButton({ complaintKey }: { complaintKey: string }) {
  const [lastNotified, setLastNotified] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/complaints/${encodeURIComponent(complaintKey)}`, { cache: "no-store" });
      const data = (await response.json()) as { subNotices?: { status: string; at: string }[] };
      return data.subNotices?.find((notice) => notice.status === "sent")?.at ?? "";
    } catch {
      return null;
    }
  }, [complaintKey]);

  useEffect(() => {
    let alive = true;
    void load().then((at) => {
      if (alive && at !== null) setLastNotified(at);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  function done(message: string, bad?: boolean) {
    showToast(message, bad ? "bad" : "good");
    void load().then((at) => {
      if (at !== null) setLastNotified(at);
    });
  }

  return (
    <div className="ui-stack">
      <BigButton kind="second" onClick={() => setOpen(true)}>
        {lastNotified ? "Notify sub again" : "Notify sub"}
      </BigButton>
      <p className="ui-muted">{lastNotified ? `Last notified: ${formatWhen(lastNotified)}` : "Not notified yet."}</p>
      <NotifySubPicker open={open} complaintKey={complaintKey} lastNotified={lastNotified ? formatWhen(lastNotified) : ""} onClose={() => setOpen(false)} onDone={done} />
    </div>
  );
}
