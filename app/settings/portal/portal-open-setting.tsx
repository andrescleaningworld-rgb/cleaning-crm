"use client";

import { useEffect, useState } from "react";
import { BigButton, Card, ConfirmSheet, ErrorBox, Field, StatusPill, showToast } from "@/app/ui";

type Setting = { available: boolean; open: boolean; ready: { withEmail: number; total: number }; officePhone: string };

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
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    fetch("/api/admin/portal-settings")
      .then((res) => res.json())
      .then((data: Setting) => {
        setSetting(data);
        setPhone(data.officePhone ?? "");
      })
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

  async function savePhone() {
    setSavingPhone(true);
    setPhoneError("");
    try {
      const res = await fetch("/api/admin/portal-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officePhone: phone }),
      });
      const data = (await res.json().catch(() => ({}))) as { officePhone?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save the number.");
      setPhone(data.officePhone ?? "");
      setSetting((current) => (current ? { ...current, officePhone: data.officePhone ?? "" } : current));
      showToast(data.officePhone ? "Office number saved." : "Office number removed.");
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Could not save the number.");
    } finally {
      setSavingPhone(false);
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

      <Card title="Office number customers see" right={<StatusPill kind={setting.officePhone ? "done" : "needs-you"}>{setting.officePhone ? "Set" : "Not set"}</StatusPill>}>
        <p>
          Shown to every customer under &quot;Call or text us&quot;, with one button to call and one to text.
          {setting.officePhone ? "" : " Until a number is typed here, that screen only offers email."}
        </p>
        <Field
          label="Office phone number"
          optional
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(201) 555-1234"
          error={phoneError || undefined}
        />
        <div className="ui-actions-row">
          <BigButton kind="second" busy={savingPhone} busyLabel="Saving…" onClick={() => void savePhone()}>
            Save number
          </BigButton>
        </div>
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
