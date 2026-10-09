"use client";

// Staff-only preview of the UI kit (app/ui): every component in every state,
// with made-up data. Not linked from the menu; open /design-preview. It is
// behind the normal staff login because proxy.ts gates every path that is
// not on its public list.

import { useState, type ReactNode } from "react";
import {
  AccountPicker,
  BigButton,
  Card,
  CardList,
  ConfirmSheet,
  EmptyState,
  ErrorBox,
  Field,
  FilterChips,
  friendlyDate,
  GLOSSARY,
  LABELS,
  MoreMenu,
  PersonPicker,
  PhotoPicker,
  PROPOSED_RENAMES,
  SaveStatus,
  Screen,
  SearchBar,
  SelectField,
  showToast,
  SkeletonList,
  StatusPill,
  Stepper,
  Tabs,
  TextAreaField,
  UiWordsProvider,
  useSaveAction,
  useUiWords,
  type StatusKind,
  type UiLang,
} from "@/app/ui";

type Sample = { id: string; name: string; city: string; status: StatusKind; next: string };

const SAMPLES: Sample[] = [
  { id: "1", name: "Maple Street Dental", city: "Newark", status: "done", next: "2026-10-09" },
  { id: "2", name: "Riverside Law Office", city: "Elizabeth", status: "waiting", next: "2026-10-10" },
  { id: "3", name: "Sunrise Daycare", city: "Union", status: "needs-you", next: "2026-10-08" },
  { id: "4", name: "Old Mill Warehouse", city: "Linden", status: "off", next: "" },
];

const PEOPLE = [
  { id: "p1", name: "Ana Silva", detail: "Manager" },
  { id: "p2", name: "Marco Reyes", detail: "Manager" },
  { id: "p3", name: "Dee Carter", detail: "Office" },
];

const ACCOUNTS = SAMPLES.map((sample) => ({ id: sample.id, name: sample.name, detail: sample.city }));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>{children}</div>
    </Card>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{children}</div>;
}

function Preview({ lang, setLang }: { lang: UiLang; setLang: (lang: UiLang) => void }) {
  const words = useUiWords();
  const [tab, setTab] = useState<"parts" | "list" | "words">("parts");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "needs-you" | "done">("all");
  const [name, setName] = useState("Maple Street Dental");
  const [person, setPerson] = useState("p1");
  const [account, setAccount] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [step, setStep] = useState(2);
  const [listState, setListState] = useState<"loaded" | "loading" | "empty" | "error">("loaded");

  const saveOk = useSaveAction(async () => {
    await wait(900);
  });
  const saveFail = useSaveAction(async () => {
    await wait(900);
    throw new Error("The internet dropped. Your changes are still here.");
  });
  const remove = useSaveAction(
    async () => {
      await wait(700);
    },
    { savedMessage: "Removed", onSaved: () => setConfirmOpen(false) }
  );

  const shown = SAMPLES.filter(
    (sample) =>
      (filter === "all" || sample.status === filter) &&
      `${sample.name} ${sample.city}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Screen
      title="Design preview"
      subtitle="Every part of the new look, with made-up data"
      backHref="/"
      headerRight={
        <MoreMenu
          items={[
            { label: "Show a green message", icon: "check", onSelect: () => showToast(words.saved) },
            { label: "Show a red message", icon: "alert", onSelect: () => showToast(words.couldNotSave, "bad") },
            { label: "Remove (asks first)", icon: "close", danger: true, onSelect: () => setConfirmOpen(true) },
          ]}
        />
      }
      action={
        <BigButton busy={saveOk.saving} busyLabel={words.saving} onClick={() => void saveOk.run()}>
          {LABELS.save}
        </BigButton>
      }
      secondaryAction={<SaveStatus action={saveOk} />}
    >
      <Tabs
        label="Preview sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "parts", label: "Parts" },
          { value: "list", label: "A list" },
          { value: "words", label: "Words" },
        ]}
      />

      {tab === "parts" ? (
        <>
          <Section title="Language of the built-in words">
            <FilterChips
              label="Language"
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: "English" },
                { value: "es", label: "Español" },
                { value: "pt", label: "Português" },
              ]}
            />
            <p className="ui-hint">
              Changes Back, Search, Saving…, Saved, Try again, Cancel, Step 2 of 4 and the status words. Dates:{" "}
              {friendlyDate("2026-10-07", lang)}.
            </p>
          </Section>

          <Section title="Buttons">
            <Row>
              <BigButton>{LABELS.save}</BigButton>
              <BigButton kind="second">{LABELS.edit}</BigButton>
              <BigButton kind="quiet">{words.cancel}</BigButton>
              <BigButton kind="danger">{LABELS.remove}</BigButton>
            </Row>
            <Row>
              <BigButton icon="plus">{LABELS.add}</BigButton>
              <BigButton busy busyLabel={words.saving}>
                {LABELS.save}
              </BigButton>
              <BigButton disabled>{LABELS.save}</BigButton>
              <BigButton kind="second" href="/design-preview">
                A link that looks like a button
              </BigButton>
            </Row>
          </Section>

          <Section title="Status: color + word + icon">
            <Row>
              <StatusPill kind="done" />
              <StatusPill kind="waiting" />
              <StatusPill kind="needs-you" />
              <StatusPill kind="off" />
            </Row>
            <Row>
              <StatusPill kind="done">Cleaned today</StatusPill>
              <StatusPill kind="waiting">Waiting for sub</StatusPill>
              <StatusPill kind="needs-you">Call customer</StatusPill>
              <StatusPill kind="off">Cancelled</StatusPill>
            </Row>
          </Section>

          <Section title="Fields">
            <Field label="Account name" value={name} onChange={(event) => setName(event.target.value)} />
            <Field label="Phone" hint="We text this number." type="tel" inputMode="tel" optional defaultValue="" />
            <Field label="Email" type="email" defaultValue="not-an-email" error="Type a full email, like name@company.com." />
            <SelectField label="How often" defaultValue="weekly">
              <option value="weekly">Every week</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Every month</option>
            </SelectField>
            <TextAreaField label="Notes" optional placeholder="Anything the crew should know" />
          </Section>

          <Section title="Saving: always show what happened">
            <Row>
              <BigButton kind="second" busy={saveOk.saving} busyLabel={words.saving} onClick={() => void saveOk.run()}>
                Save that works
              </BigButton>
              <BigButton kind="second" busy={saveFail.saving} busyLabel={words.saving} onClick={() => void saveFail.run()}>
                Save that fails
              </BigButton>
            </Row>
            <SaveStatus action={saveFail} />
            <ErrorBox title="We could not load this." text="Check the internet and try again." onRetry={() => showToast(words.loading)} />
          </Section>

          <Section title="Steps">
            <Stepper step={step} total={4} label="Who cleans it" />
            <Row>
              <BigButton kind="second" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>
                {words.back}
              </BigButton>
              <BigButton kind="second" disabled={step === 4} onClick={() => setStep((value) => Math.min(4, value + 1))}>
                {LABELS.next}
              </BigButton>
            </Row>
          </Section>

          <Section title="Pick a person, pick an account">
            <PersonPicker label="Manager" searchLabel="Search people" options={PEOPLE} value={person} onChange={setPerson} />
            <AccountPicker label="Account" searchLabel="Search accounts" options={ACCOUNTS} value={account} onChange={setAccount} />
          </Section>

          <Section title="Photos">
            <PhotoPicker label="Photos of the problem" files={photos} onChange={setPhotos} max={4} />
          </Section>
        </>
      ) : null}

      {tab === "list" ? (
        <>
          <SearchBar value={query} onChange={setQuery} label="Search accounts" />
          <FilterChips
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: SAMPLES.length },
              { value: "needs-you", label: words.statusNeedsYou, count: SAMPLES.filter((s) => s.status === "needs-you").length },
              { value: "done", label: words.statusDone, count: SAMPLES.filter((s) => s.status === "done").length },
            ]}
          />
          <FilterChips
            label="List state (preview only)"
            value={listState === "error" ? "loaded" : listState}
            onChange={setListState}
            options={[
              { value: "loaded", label: "Loaded" },
              { value: "loading", label: "Loading" },
              { value: "empty", label: "Empty" },
            ]}
          />

          {listState === "loading" ? (
            <SkeletonList rows={3} />
          ) : listState === "empty" || shown.length === 0 ? (
            <EmptyState
              title={listState === "empty" ? "No accounts yet" : "No accounts match"}
              text={listState === "empty" ? "Add your first account to get started." : "Try a shorter search, or show all."}
              action={
                listState === "empty" ? (
                  <BigButton kind="second" icon="plus">
                    Add account
                  </BigButton>
                ) : (
                  <BigButton
                    kind="second"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Show all
                  </BigButton>
                )
              }
            />
          ) : (
            <CardList
              label="Accounts"
              items={shown}
              getKey={(sample) => sample.id}
              href={() => "/design-preview"}
              renderCard={(sample) => (
                <Card title={sample.name} right={<StatusPill kind={sample.status} />} href="/design-preview">
                  <p className="ui-card-text">
                    {sample.city}
                    {sample.next ? ` · Next clean ${friendlyDate(sample.next, lang)}` : ""}
                  </p>
                </Card>
              )}
              columns={[
                { header: "Account", cell: (sample) => sample.name },
                { header: "City", cell: (sample) => sample.city },
                { header: "Next clean", cell: (sample) => friendlyDate(sample.next, lang) || "Not set" },
                { header: "Status", cell: (sample) => <StatusPill kind={sample.status} /> },
              ]}
            />
          )}
        </>
      ) : null}

      {tab === "words" ? (
        <>
          <Section title="Button words">
            <Row>
              {Object.values(LABELS).map((label) => (
                <BigButton key={label} kind="second">
                  {label}
                </BigButton>
              ))}
            </Row>
            <p className="ui-hint">Buttons say what they do. No button says “Submit”.</p>
          </Section>
          <Section title="What the words mean">
            <CardList
              label="Glossary"
              items={GLOSSARY}
              getKey={(entry) => entry.word}
              renderCard={(entry) => (
                <Card title={entry.word}>
                  <p className="ui-card-text">{entry.means}</p>
                </Card>
              )}
            />
          </Section>
          <Section title="Name changes waiting for your OK (not used anywhere yet)">
            <CardList
              label="Proposed renames"
              items={PROPOSED_RENAMES}
              getKey={(entry) => entry.today}
              renderCard={(entry) => (
                <Card title={`${entry.today} → ${entry.proposed}`} right={<StatusPill kind="waiting" />}>
                  <p className="ui-card-text">{entry.why}</p>
                </Card>
              )}
            />
          </Section>
        </>
      ) : null}

      <ConfirmSheet
        open={confirmOpen}
        title="Remove this visit?"
        text="This removes the visit from Oct 7. It cannot be brought back."
        confirmLabel="Remove visit"
        busy={remove.saving}
        busyLabel={words.saving}
        onConfirm={() => void remove.run()}
        onCancel={() => setConfirmOpen(false)}
      />
    </Screen>
  );
}

export default function DesignPreviewPage() {
  const [lang, setLang] = useState<UiLang>("en");
  return (
    <UiWordsProvider lang={lang}>
      <Preview lang={lang} setLang={setLang} />
    </UiWordsProvider>
  );
}
