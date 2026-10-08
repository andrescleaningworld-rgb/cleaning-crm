"use client";

import { useEffect, useState } from "react";
import { BigButton, Card, ConfirmSheet, ErrorBox, StatusPill, showToast } from "@/app/ui";

type Setting = { available: boolean; open: boolean; ready: { withEmail: number; total: number } };

/**
 * "Portal open to customers". OFF means no real customer can log in, set a
 * password or be invited; only test accounts work. Shown only where the new
 * portal is running.
 */
export default function PortalOpenSetting() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/portal-settings")
      .then((res) => res.json())
      .then((data: Setting) => setSetting(data))
      .catch(() => setError("Could not load the portal setting."));
  }, []);

  async function save(open: boolean) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/portal-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open }),
      });
      if (!res.ok) throw new Error("save");
      setSetting((current) => (current ? { ...current, open } : current));
      showToast(open ? "The portal is open to customers." : "The portal is closed to customers.");
    } catch {
      setError("Could not save the portal setting.");
    } finally {
      setSaving(false);
      setAsking(false);
    }
  }

  if (error && !setting) return <ErrorBox title={error} />;
  if (!setting || !setting.available) return null;

  return (
    <>
      <Card title="Portal open to customers" right={<StatusPill kind={setting.open ? "done" : "off"}>{setting.open ? "ON" : "OFF"}</StatusPill>}>
        <p>
          {setting.open
            ? "Customers with an email on their account can set a password and log in."
            : "OFF: no customer can log in, set a password or be invited. Only test accounts work."}
        </p>
        <p className="ui-muted">
          {setting.ready.withEmail} of {setting.ready.total} accounts with portal access have an email. The others cannot log in until an email is added to the account.
        </p>
        <div className="ui-actions-row">
          <BigButton kind={setting.open ? "danger" : "second"} onClick={() => setAsking(true)}>
            {setting.open ? "Close the portal" : "Open the portal to customers"}
          </BigButton>
        </div>
        {error ? <ErrorBox title={error} /> : null}
      </Card>

      <ConfirmSheet
        open={asking}
        title={setting.open ? "Close the portal to customers?" : "Open the portal to customers?"}
        text={
          setting.open
            ? "Customers will not be able to log in until you open it again. Their passwords are kept."
            : `Customers with an email on their account will be able to set a password and log in. That is ${setting.ready.withEmail} of ${setting.ready.total} accounts today. Nobody is emailed by this; invites are sent one by one from the account page.`
        }
        confirmLabel={setting.open ? "Close the portal" : "Open the portal"}
        busy={saving}
        busyLabel="Saving…"
        onConfirm={() => void save(!setting.open)}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
