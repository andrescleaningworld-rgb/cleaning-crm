"use client";

// The sections of Settings -> Reminders & check-ins (./page.tsx), top to
// bottom. Each reminder feature adds its own section to SECTIONS.

import type { ReactNode } from "react";
import { Card } from "@/app/ui";
import type { FeatureSettingKey, FeatureSettings } from "@/lib/featureSettings";

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
          text={'Turns on the "Upload my insurance" button and banner in the sub portal, and the reminder email to the sub (English, Spanish, Portuguese). What a sub sends waits for the office to approve it.'}
          on={settings.subInsurancePortal.on}
          canEdit={canEdit}
          onChange={(on) => void save("subInsurancePortal", { on })}
        />
      </div>
    </Card>
  );
}

export const SECTIONS: ((props: SectionProps) => ReactNode)[] = [InsuranceSection];
