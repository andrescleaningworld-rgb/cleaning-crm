"use client";

// Settings -> Team: who owns the Office steps (one or more people), how many
// days before an account update or a supply order turns red, and, for new
// accounts, who owns each checklist section and when it is due.
// Everyone on staff can read it; only the owner can change it.

import { useEffect, useState } from "react";
import { BigButton, Card, EmptyState, ErrorBox, Field, Screen, SelectField, SkeletonList, Tips, showToast } from "@/app/ui";
import { onboardingRules, sectionName, type HandoffSettings, type OnboardingRule } from "@/lib/handoffs";
import { ONBOARDING_CHECKLIST_SECTIONS } from "@/lib/onboardingChecklist";
import { postHandoff, useHandoffs } from "../../components/handoffs";

type ManagerRow = { name?: string; status?: string };

export default function TeamSettingsPage() {
  const handoffs = useHandoffs();
  const [people, setPeople] = useState<string[]>([]);
  const [office, setOffice] = useState<string[]>([]);
  const [days, setDays] = useState("2");
  const [rules, setRules] = useState<Record<string, OnboardingRule>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canEdit = handoffs.me.role === "owner";

  // The people who can be picked: the active managers (Settings -> Managers).
  useEffect(() => {
    fetch("/api/admin/managers", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { managers?: ManagerRow[]; data?: ManagerRow[] } | ManagerRow[]) => {
        const rows: ManagerRow[] = Array.isArray(data) ? data : (data.managers ?? data.data ?? []);
        setPeople(
          Array.from(
            new Set(
              rows
                .filter((row) => !row.status || row.status === "Active")
                .map((row) => (row.name ?? "").trim())
                .filter(Boolean)
            )
          ).sort()
        );
      })
      .catch(() => setPeople([]));
  }, []);

  // Fill the form once the saved settings arrive.
  const settings = handoffs.settings;
  useEffect(() => {
    if (!settings) return;
    setOffice(settings.officeOwners);
    setDays(String(settings.redAfterDays));
    setRules(onboardingRules(settings));
  }, [settings]);

  // Someone picked earlier who is no longer an active manager still shows, so they can be unticked.
  const choices = Array.from(new Set([...people, ...office])).sort();

  async function save() {
    setError("");
    const redAfterDays = Math.round(Number(days));
    if (!Number.isFinite(redAfterDays) || redAfterDays < 1 || redAfterDays > 30) {
      setError("Days before red must be a number from 1 to 30.");
      return;
    }
    setSaving(true);
    try {
      const next: HandoffSettings = { officeOwners: office, redAfterDays, onboarding: rules };
      await postHandoff({ action: "saveSettings", settings: next });
      await handoffs.reload();
      showToast("Saved ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Team"
      subtitle="Who does the Office steps, and when something turns red."
      backHref="/settings"
      action={
        canEdit && handoffs.state === "ready" ? (
          <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
            Save
          </BigButton>
        ) : undefined
      }
    >
      <Tips
        id="settings-team"
        ready={handoffs.state === "ready"}
        steps={[
          { target: '[data-tip="office"]', text: "Tick the people who do the Office steps. They see Office work in My work on the Dashboard." },
          { target: '[data-tip="red"]', text: "After this many days on one step, an account update or a supply order turns red." },
        ]}
      />

      {handoffs.state === "loading" ? (
        <SkeletonList rows={3} />
      ) : handoffs.state === "off" ? (
        <EmptyState title="Not turned on here yet" text="Team settings work once this database has the handoff tables." />
      ) : handoffs.state === "failed" ? (
        <ErrorBox title="The team settings did not load." onRetry={() => void handoffs.reload()} />
      ) : (
        <>
          {!canEdit ? <p className="ui-savestatus">Only the owner can change these. You can read them.</p> : null}

          <Card title="Office">
            <p className="ui-card-text">Who owns the Office steps: entering new accounts, processing account updates, buying supplies. Pick one or more people.</p>
            <div className="ui-checks" data-tip="office" style={{ marginTop: 12 }}>
              {choices.length === 0 ? <p className="ui-muted">No managers found. Add them in Settings first.</p> : null}
              {choices.map((name) => (
                <label key={name} className="ui-check">
                  <input
                    type="checkbox"
                    checked={office.includes(name)}
                    disabled={!canEdit || saving}
                    onChange={(event) => setOffice((current) => (event.target.checked ? [...current, name] : current.filter((entry) => entry !== name)))}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
            {office.length === 0 ? <p className="ui-field-error">Nobody is picked, so Office work goes to the owner for now.</p> : null}
          </Card>

          <Card title="When it turns red">
            <div data-tip="red">
              <Field
                label="Days on one step before it turns red"
                hint="For account updates and supply orders. New accounts turn red on each step's due date, below."
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                value={days}
                disabled={!canEdit || saving}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
          </Card>

          <Card title="New accounts: who does each step, and by when">
            <p className="ui-card-text">Days are counted from the day the estimate was accepted.</p>
            <div className="ui-stack" style={{ marginTop: 12 }}>
              {ONBOARDING_CHECKLIST_SECTIONS.map((section, index) => {
                const rule = rules[section.key] ?? { owner: "office", days: 7 };
                return (
                  <div key={section.key} className="ui-team-row">
                    <p className="ui-strong">
                      {index + 1}. {sectionName(section.key)}
                    </p>
                    <SelectField
                      label="Owner"
                      value={rule.owner}
                      disabled={!canEdit || saving}
                      onChange={(event) => setRules((current) => ({ ...current, [section.key]: { ...rule, owner: event.target.value === "manager" ? "manager" : "office" } }))}
                    >
                      <option value="office">Office</option>
                      <option value="manager">The account&apos;s manager</option>
                    </SelectField>
                    <Field
                      label="Due after (days)"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={120}
                      value={String(rule.days)}
                      disabled={!canEdit || saving}
                      onChange={(event) => setRules((current) => ({ ...current, [section.key]: { ...rule, days: Math.max(0, Math.round(Number(event.target.value) || 0)) } }))}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          {error ? <ErrorBox title="Not saved yet." text={error} onRetry={() => void save()} /> : null}
        </>
      )}
    </Screen>
  );
}
