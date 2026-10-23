"use client";

// The sections of Settings -> Reminders & check-ins (./page.tsx), top to
// bottom. Each reminder feature adds its own section to SECTIONS.

import { useEffect, useState, type ReactNode } from "react";
import { BigButton, Card, showToast } from "@/app/ui";
import { CHECKIN_SEND_FROM_DAY, CHECKIN_TEST_EMAIL } from "@/lib/customerCheckin";
import { DEFAULT_FEATURE_SETTINGS, type AtRiskSetting, type FeatureSettingKey, type FeatureSettings } from "@/lib/featureSettings";

export type SectionProps = {
  settings: FeatureSettings;
  canEdit: boolean;
  save: <K extends FeatureSettingKey>(key: K, value: FeatureSettings[K]) => Promise<boolean>;
};

/** One big on/off line. Green when on. */
export function Switch({ label, text, on, canEdit, onChange }: { label: string; text: string; on: boolean; canEdit: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="ui-stack">
      <p className="ui-strong">{label}</p>
      <p className="ui-card-text">{text}</p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={!canEdit}
        onClick={() => onChange(!on)}
        className="ui-btn"
        style={{ minHeight: 56, fontSize: 18, fontWeight: 700, color: "#ffffff", background: on ? "#15803d" : "#64748b" }}
      >
        {on ? "ON · tap to turn off" : "OFF · tap to turn on"}
      </button>
    </div>
  );
}

function InsuranceSection({ settings, canEdit, save }: SectionProps) {
  return (
    <Card title="🛡️ Sub insurance">
      <div className="ui-stack">
        <p className="ui-card-text">
          The office always gets a paper on the Pin Board and an email to info@ 30 days before a sub&apos;s insurance expires, and again when it expires.
        </p>
        <Switch
          label="Subs upload their insurance in the portal"
          text={'The "Upload my insurance" button and banner in the sub portal, and the reminder emails to subs (English, Spanish, Portuguese): missing or expired every 7 days, expiring at 30, 14 and 3 days before. Only active subs with an active account. Paused while a COI waits for approval. What a sub sends waits for the office to approve it.'}
          on={settings.subInsurancePortal.on}
          canEdit={canEdit}
          onChange={(on) => void save("subInsurancePortal", { on })}
        />
      </div>
    </Card>
  );
}

/** A pair of number boxes: when it turns yellow, when it turns red. */
function ThresholdRow({ label, yellow, red, onYellow, onRed, disabled, unit }: { label: string; yellow: number; red: number; onYellow: (n: number) => void; onRed: (n: number) => void; disabled: boolean; unit: string }) {
  const box = (value: number, onChange: (n: number) => void, color: string, word: string) => (
    <label className="ui-field" style={{ flex: 1 }}>
      <span className="ui-label">
        {color} {word}
      </span>
      <input className="ui-input" type="number" min={0} inputMode="decimal" disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
  return (
    <div className="ui-stack">
      <p className="ui-strong">{label}</p>
      <div className="ui-actions-row" style={{ alignItems: "flex-end" }}>
        {box(yellow, onYellow, "🟡", `Yellow ${unit}`)}
        {box(red, onRed, "🔴", `Red ${unit}`)}
      </div>
    </div>
  );
}

function AtRiskSection({ settings, canEdit, save }: SectionProps) {
  const [t, setT] = useState<AtRiskSetting>(settings.atRisk);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the saved values once they load
  useEffect(() => setT(settings.atRisk), [settings.atRisk]);
  const set = (field: keyof AtRiskSetting) => (n: number) => setT((current) => ({ ...current, [field]: Number.isFinite(n) ? n : 0 }));
  const d = DEFAULT_FEATURE_SETTINGS.atRisk;
  return (
    <Card title="🚦 At risk accounts">
      <div className="ui-stack">
        <p className="ui-card-text">
          Each active account gets 🟢 / 🟡 / 🔴. It takes the worst of these. A red account gets a paper in its manager&apos;s square. Staff only: subs and
          customers never see it.
        </p>
        <ThresholdRow label="Complaints in the last 30 days" unit="at" yellow={t.complaintsYellow} red={t.complaintsRed} onYellow={set("complaintsYellow")} onRed={set("complaintsRed")} disabled={!canEdit} />
        <ThresholdRow label="Days with no manager visit" unit="after" yellow={t.visitDaysYellow} red={t.visitDaysRed} onYellow={set("visitDaysYellow")} onRed={set("visitDaysRed")} disabled={!canEdit} />
        <ThresholdRow label="Sub score" unit="below" yellow={t.scoreYellowBelow} red={t.scoreRedBelow} onYellow={set("scoreYellowBelow")} onRed={set("scoreRedBelow")} disabled={!canEdit} />
        <ThresholdRow label="👎 from the customer check-in, last 60 days" unit="at" yellow={t.thumbsDownYellow} red={t.thumbsDownRed} onYellow={set("thumbsDownYellow")} onRed={set("thumbsDownRed")} disabled={!canEdit} />
        <p className="ui-muted">
          Start: complaints {d.complaintsYellow} / {d.complaintsRed}, no visit after {d.visitDaysYellow} / {d.visitDaysRed} days, sub score below {d.scoreYellowBelow} / {d.scoreRedBelow}, 👎{" "}
          {d.thumbsDownYellow} / {d.thumbsDownRed}.
        </p>
        <div className="ui-actions-row">
          <BigButton disabled={!canEdit} onClick={() => void save("atRisk", t)}>
            Save
          </BigButton>
          <BigButton kind="second" disabled={!canEdit} onClick={() => setT(d)}>
            Back to the start numbers
          </BigButton>
        </div>
      </div>
    </Card>
  );
}

function CheckinSection({ settings, canEdit, save }: SectionProps) {
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    try {
      const response = await fetch("/api/customer-checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      showToast(data.success ? `Test sent to ${CHECKIN_TEST_EMAIL} ✓` : data.error || "The test was not sent.", data.success ? undefined : "bad");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="👍 Customer monthly check-in">
      <div className="ui-stack">
        <p className="ui-card-text">
          From the {CHECKIN_SEND_FROM_DAY}th of each month, each active customer gets one email: &quot;How was your cleaning this month?&quot; with 👍 and 👎. No login.
          👎 asks &quot;What went wrong?&quot; and puts a paper in the manager&apos;s square. Customers can stop the emails with one tap. Email only for now.
        </p>
        <Switch
          label="Send the monthly check-in to customers"
          text="Customers see this. Send yourself a test first."
          on={settings.checkin.on}
          canEdit={canEdit}
          onChange={(on) => void save("checkin", { on })}
        />
        <BigButton kind="second" busy={busy} busyLabel="Sending…" onClick={() => void test()}>
          Send me a test ({CHECKIN_TEST_EMAIL})
        </BigButton>
      </div>
    </Card>
  );
}

export const SECTIONS: ((props: SectionProps) => ReactNode)[] = [InsuranceSection, AtRiskSection, CheckinSection];
