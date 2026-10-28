"use client";

// Settings -> Site survey photos: the shot list on the setup wizard's "Take
// pictures" screen, in order. "Anything else" is always added at the end.
// Saved in feature_settings (key surveyShots, lib/featureSettings.ts); staff
// can see it, only the owner changes it. Photos already taken keep the label
// they were taken with.

import { useCallback, useEffect, useState } from "react";
import { BigButton, ErrorBox, Field, Screen, showToast } from "@/app/ui";
import { DEFAULT_FEATURE_SETTINGS, type FeatureSettings } from "@/lib/featureSettings";
import { ANYTHING_ELSE_SHOT, DEFAULT_SURVEY_SHOTS } from "@/lib/setupWizard";

type Reply = { success?: boolean; ready?: boolean; settings?: FeatureSettings; error?: string };

export default function SiteSurveySettingsPage() {
  const [reply, setReply] = useState<Reply | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/feature-settings", { cache: "no-store" });
      const data = (await response.json()) as Reply;
      setReply(data);
      setLabels((data.settings ?? DEFAULT_FEATURE_SETTINGS).surveyShots.labels);
    } catch {
      setReply({ success: false, error: "Settings did not load." });
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/session-role", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { role?: string }) => setIsOwner(data.role === "owner"))
      .catch(() => setIsOwner(false));
  }, [load]);

  const canEdit = isOwner && reply?.ready === true;

  async function save(next: string[]) {
    setSaving(true);
    try {
      const response = await fetch("/api/feature-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "surveyShots", value: { labels: next } }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; value?: { labels?: string[] } };
      if (!data.success) throw new Error(data.error || "That did not save.");
      setLabels(data.value?.labels ?? next);
      showToast("Saved ✓");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save.", "bad");
    } finally {
      setSaving(false);
    }
  }

  const move = (index: number, by: number) => {
    const next = [...labels];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item);
    void save(next);
  };

  return (
    <Screen title="Site survey photos" subtitle="The shot list in the setup wizard" backHref="/settings">
      {reply && !reply.success ? <ErrorBox title="Settings did not load." text={reply.error || "Try again."} onRetry={() => void load()} /> : null}
      {reply?.success && !reply.ready ? <p className="ui-muted">This can be changed once the update for settings (migration 056) is installed. Until then the wizard uses the list below.</p> : null}
      {reply?.success && reply.ready && !isOwner ? <p className="ui-muted">Only the owner can change this.</p> : null}
      <div className="ui-stack">
        {labels.map((label, index) => (
          <div key={label} className="ui-card ui-stack">
            <p className="ui-strong">
              {index + 1}. {label}
            </p>
            {canEdit ? (
              <div className="ui-actions-row">
                <BigButton kind="quiet" disabled={saving || index === 0} onClick={() => move(index, -1)}>
                  ↑ Up
                </BigButton>
                <BigButton kind="quiet" disabled={saving || index === labels.length - 1} onClick={() => move(index, 1)}>
                  ↓ Down
                </BigButton>
                <BigButton kind="quiet" disabled={saving} onClick={() => void save(labels.filter((_, i) => i !== index))}>
                  Remove
                </BigButton>
              </div>
            ) : null}
          </div>
        ))}
        <p className="ui-muted">Always last: {ANYTHING_ELSE_SHOT} (as many photos as you want).</p>
        {canEdit ? (
          <div className="ui-card ui-stack">
            <Field label="Add a shot" placeholder="Loading dock" maxLength={40} value={adding} onChange={(event) => setAdding(event.target.value)} />
            <BigButton
              disabled={saving || !adding.trim()}
              onClick={() => {
                void save([...labels, adding.trim()]).then(() => setAdding(""));
              }}
            >
              Add
            </BigButton>
            <BigButton kind="second" disabled={saving} onClick={() => void save([...DEFAULT_SURVEY_SHOTS])}>
              Back to the first list
            </BigButton>
          </div>
        ) : null}
      </div>
      <BigButton kind="second" href="/settings">
        Back to Settings
      </BigButton>
    </Screen>
  );
}
