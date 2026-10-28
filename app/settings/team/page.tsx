"use client";

// Settings -> Team: who owns the Office steps (one or more people), how many
// days before an account update or a supply order turns red, and, for new
// accounts, who owns each checklist section and when it is due.
// Everyone on staff can read it; only the owner can change it.
// Each change saves by itself and says "Saved ✓".

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, EmptyState, ErrorBox, Field, Screen, SelectField, SkeletonList, Tips } from "@/app/ui";
import { onboardingRules, sectionName, type HandoffMe, type HandoffSettings, type OnboardingRule } from "@/lib/handoffs";
import { LEGACY_ONBOARDING_SECTIONS as ONBOARDING_CHECKLIST_SECTIONS } from "@/lib/onboardingChecklist";
import { postHandoff } from "../../components/handoffs";
import ConnectedTvs from "./connected-tvs";

type Loaded = { success?: boolean; ready?: boolean; featureOn?: boolean; settings?: HandoffSettings; me?: HandoffMe; people?: string[]; peopleError?: string };
type SaveState = "" | "saving" | "saved" | "failed";

export default function TeamSettingsPage() {
  const [state, setState] = useState<"loading" | "off" | "failed" | "ready">("loading");
  const [canEdit, setCanEdit] = useState(false);
  const [featureOn, setFeatureOn] = useState(true);
  const [people, setPeople] = useState<string[]>([]);
  const [peopleError, setPeopleError] = useState("");
  const [office, setOffice] = useState<string[]>([]);
  const [days, setDays] = useState("2");
  const [rules, setRules] = useState<Record<string, OnboardingRule>>({});
  const [save, setSave] = useState<SaveState>("");
  const [error, setError] = useState("");
  // What is saved on the server, to put back when a save fails.
  const saved = useRef<HandoffSettings | null>(null);
  // Saves go one after another, so a quick second tap never lands before the first.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const show = (settings: HandoffSettings) => {
    saved.current = settings;
    setOffice(settings.officeOwners);
    setDays(String(settings.redAfterDays));
    setRules(onboardingRules(settings));
  };

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/handoffs?view=settings", { cache: "no-store" });
      const data = (await response.json()) as Loaded;
      if (!response.ok || data.success === false) return setState("failed");
      if (!data.ready || !data.settings) return setState("off");
      setCanEdit(data.me?.role === "owner");
      setFeatureOn(data.featureOn !== false);
      setPeople(data.people ?? []);
      setPeopleError(data.peopleError ?? "");
      show(data.settings);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    // The first load: fetches, then sets state when the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Saves the whole form as it should now be. On a failure the screen goes back to what is really saved. */
  const saveNow = (next: HandoffSettings) => {
    setError("");
    setSave("saving");
    queue.current = queue.current.then(async () => {
      try {
        const data = await postHandoff<{ settings?: HandoffSettings }>({ action: "saveSettings", settings: next });
        if (data.settings) saved.current = data.settings;
        setSave("saved");
      } catch (err) {
        if (saved.current) show(saved.current);
        setSave("failed");
        setError(err instanceof Error ? err.message : "That did not save. Try again.");
      }
    });
  };

  const current = (): HandoffSettings => ({ officeOwners: office, redAfterDays: saved.current?.redAfterDays ?? 2, onboarding: rules });

  const toggleOffice = (name: string, on: boolean) => {
    const next = on ? [...office.filter((entry) => entry !== name), name] : office.filter((entry) => entry !== name);
    setOffice(next);
    saveNow({ ...current(), officeOwners: next });
  };

  const saveDays = () => {
    const value = Math.round(Number(days));
    if (String(value) === String(saved.current?.redAfterDays)) return;
    if (!Number.isFinite(value) || value < 1 || value > 30) {
      setSave("failed");
      setError("Days before red must be a number from 1 to 30.");
      return;
    }
    setDays(String(value));
    saveNow({ ...current(), redAfterDays: value });
  };

  const changeRule = (key: string, rule: OnboardingRule, saveIt: boolean) => {
    const next = { ...rules, [key]: rule };
    setRules(next);
    if (saveIt) saveNow({ ...current(), onboarding: next });
  };

  // Someone picked earlier who is no longer active still shows, so they can be unticked.
  const choices = Array.from(new Set([...people, ...office])).sort((a, b) => a.localeCompare(b));
  const locked = !canEdit;

  return (
    <Screen title="Team" subtitle="Who does the Office steps, and when something turns red." backHref="/settings">
      <Tips
        id="settings-team"
        ready={state === "ready"}
        steps={[
          { target: '[data-tip="office"]', text: "Tick the people who do the Office steps. Each change saves by itself." },
          { target: '[data-tip="red"]', text: "After this many days on one step, an account update or a supply order turns red." },
        ]}
      />

      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="This needs a database update first" text="Team settings are saved in tables this database does not have yet. Nothing is wrong with your login. Ask for the database update, then open this page again." />
      ) : state === "failed" ? (
        <ErrorBox title="The team settings did not load." onRetry={() => void load()} />
      ) : (
        <>
          {locked ? <p className="ui-savestatus">Only the owner can change these. You can read them.</p> : null}
          {!featureOn ? <p className="ui-muted">My work and To process are not switched on in this version yet. What you choose here is saved and is used as soon as they are.</p> : null}

          <p className={`ui-savestatus ${save === "saving" ? "ui-savestatus-saving" : save === "saved" ? "ui-savestatus-saved" : ""}`} role="status" aria-live="polite" data-save-status={save}>
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved ✓" : ""}
          </p>
          {error ? <ErrorBox title="Not saved." text={error} /> : null}

          <Card title="Office">
            <p className="ui-card-text">Who owns the Office steps: entering new accounts, processing account updates, buying supplies. Pick one or more people.</p>
            <div className="ui-checks" data-tip="office" style={{ marginTop: 12 }}>
              {peopleError ? <p className="ui-field-error">{peopleError}</p> : null}
              {choices.length === 0 && !peopleError ? <p className="ui-muted">Nobody to pick yet. Add managers and office staff in Settings, Staff. They show here once they are Active.</p> : null}
              {choices.map((name) => (
                <label key={name} className="ui-check">
                  <input type="checkbox" checked={office.includes(name)} disabled={locked} onChange={(event) => toggleOffice(name, event.target.checked)} />
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
                hint="For account updates and supply orders. New accounts turn red on each step's due date, below. It saves when you leave the box."
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                value={days}
                disabled={locked}
                onChange={(event) => setDays(event.target.value)}
                onBlur={saveDays}
              />
            </div>
          </Card>

          <Card title="New accounts: who does each step, and by when">
            <p className="ui-card-text">Days are counted from the day the estimate was accepted. Office means the people ticked above.</p>
            <div className="ui-stack" style={{ marginTop: 12 }}>
              {ONBOARDING_CHECKLIST_SECTIONS.map((section, index) => {
                const rule = rules[section.key] ?? { owner: "office", days: 7 };
                return (
                  <div key={section.key} className="ui-team-row">
                    <p className="ui-strong">
                      {index + 1}. {sectionName(section.key)}
                    </p>
                    <SelectField label="Owner" value={rule.owner} disabled={locked} onChange={(event) => changeRule(section.key, { ...rule, owner: event.target.value === "manager" ? "manager" : "office" }, true)}>
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
                      disabled={locked}
                      onChange={(event) => changeRule(section.key, { ...rule, days: Math.min(120, Math.max(0, Math.round(Number(event.target.value) || 0))) }, false)}
                      onBlur={() => {
                        if (saved.current && onboardingRules(saved.current)[section.key]?.days !== rule.days) saveNow({ ...current(), onboarding: rules });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          {canEdit ? <ConnectedTvs /> : null}
        </>
      )}
    </Screen>
  );
}
