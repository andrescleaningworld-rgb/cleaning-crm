"use client";

// Settings -> Reminders & check-ins. Everyone on staff can see these; only
// the owner changes them. Server: app/api/feature-settings
// (lib/pg/feature-settings.ts, defaults in lib/featureSettings.ts).
//
// Anything a sub or a customer sees starts OFF.

import { useCallback, useEffect, useState } from "react";
import { BigButton, ErrorBox, Screen, showToast } from "@/app/ui";
import { DEFAULT_FEATURE_SETTINGS, type FeatureSettings } from "@/lib/featureSettings";
import { SECTIONS, type SectionProps } from "./sections";

type Reply = { success?: boolean; ready?: boolean; settings?: FeatureSettings; error?: string };

export default function RemindersSettingsPage() {
  const [reply, setReply] = useState<Reply | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/feature-settings", { cache: "no-store" });
      setReply((await response.json()) as Reply);
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

  const save: SectionProps["save"] = async (key, value) => {
    try {
      const response = await fetch("/api/feature-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; value?: unknown };
      if (!data.success) throw new Error(data.error || "That did not save.");
      setReply((current) => (current?.settings ? { ...current, settings: { ...current.settings, [key]: data.value } } : current));
      showToast("Saved ✓");
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save.", "bad");
      return false;
    }
  };

  const settings = reply?.settings ?? DEFAULT_FEATURE_SETTINGS;
  const canEdit = isOwner && reply?.ready === true;

  return (
    <Screen title="Reminders & check-ins" subtitle="Insurance, at risk accounts, price reviews, customer check-in" backHref="/settings">
      {reply && !reply.success ? <ErrorBox title="Settings did not load." text={reply.error || "Try again."} onRetry={() => void load()} /> : null}
      {reply?.success && !reply.ready ? (
        <p className="ui-muted">These can be changed once the update for them (migration 056) is installed. Until then everything uses the defaults shown.</p>
      ) : null}
      {reply?.success && reply.ready && !isOwner ? <p className="ui-muted">Only the owner can change these.</p> : null}
      <div className="ui-stack">
        {SECTIONS.map((Section, index) => (
          <Section key={index} settings={settings} canEdit={canEdit} save={save} />
        ))}
      </div>
      <BigButton kind="second" href="/settings">
        Back to Settings
      </BigButton>
    </Screen>
  );
}
