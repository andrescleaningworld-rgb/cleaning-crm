"use client";

// CW Now (Crew Link): an account's crew list and sending them their link
// (lib/crewLinkPeople.ts, app/api/crew-link/people). Used by the account's
// CW Now card: the setup wizard ("Who's on the crew?", then "Send") and its
// Send button.
//   - Each person: name, phone, language (EN / ES / PT), and their own tab
//     (Person 1 / Person 2…) when the account has more than one.
//   - "Send by WhatsApp" (the big green one) opens WhatsApp Web / Desktop or
//     the phone app with the message in their language and their own link
//     (on their tab). "Sent Nov 17 by Ana" after; "Send again" is one tap.
//   - More ways: Copy message, Print QR sign, Send from my phone (the QR to
//     scan): the same buttons as before (CrewLinkShare), smaller.
// Texts are never sent by us: Textbelt blocks texts with links.

import { useState } from "react";
import CrewLinkShare, { type ShareMethod } from "@/app/components/CrewLinkShare";
import { CREW_LANGS, crewInviteMessage, crewPersonLink, whatsappHref, whatsappNumber, whenLong, type CrewLang, type CrewPeopleData, type CrewPerson, type CrewSendMethod } from "@/lib/crewLinkPeople";
import type { ChecklistTabDef } from "@/lib/checklistTemplate";

type Draft = { id: number | null; name: string; phone: string; language: CrewLang; tabId: number | null };
const EMPTY_DRAFT: Draft = { id: null, name: "", phone: "", language: "en", tabId: null };

const LANG_SHORT: Record<CrewLang, string> = { en: "EN", es: "ES", pt: "PT" };

export default function CrewPeople({
  accountId,
  placeName,
  baseUrl,
  tabs,
  data,
  onChange,
  mode,
}: {
  accountId: string;
  placeName: string;
  /** The account's crew link (…/porter/<code>). */
  baseUrl: string;
  tabs: ChecklistTabDef[];
  data: CrewPeopleData;
  onChange: (data: CrewPeopleData) => void;
  /** "people": add and change people (setup step 2). "send": send them their link. */
  mode: "people" | "send";
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [moreFor, setMoreFor] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const tabChoices = tabs.filter((tab) => tab.sections.some((section) => section.items.length > 0));

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/crew-link/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ...body }),
      });
      const reply = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string } & Partial<CrewPeopleData>;
      if (!response.ok || !reply.success) throw new Error(reply.error || "That did not save.");
      onChange({ ready: reply.ready ?? true, people: reply.people ?? [], lastUsedAt: reply.lastUsedAt ?? data.lastUsedAt });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Type the person's name.");
    if (draft.phone.trim() && !whatsappNumber(draft.phone)) return setError("That phone number does not look right. Type 10 digits, like 201-555-0123.");
    if (await post({ action: "save", id: draft.id, name: draft.name, phone: draft.phone, language: draft.language, tabId: draft.tabId })) setDraft(null);
  }

  const linkOf = (person: CrewPerson) => crewPersonLink(baseUrl, person);
  const messageOf = (person: CrewPerson) => crewInviteMessage(person.language, person.name, placeName, linkOf(person));
  const tabName = (tabId: number | null) => tabs.find((tab) => tab.id === tabId)?.name ?? "";

  function sent(person: CrewPerson, method: CrewSendMethod) {
    void post({ action: "sent", id: person.id, method });
  }

  if (!data.ready) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">The crew list needs migration 081 first. Until then, use More options → Copy link.</p>;
  }

  const form = draft ? (
    <div className="space-y-3 rounded-2xl border-2 border-blue-300 bg-blue-50 p-4">
      <label className="block">
        <span className="text-sm font-black text-slate-700">Name</span>
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          maxLength={80}
          autoFocus
          className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-lg outline-none focus:border-blue-600"
        />
      </label>
      <label className="block">
        <span className="text-sm font-black text-slate-700">WhatsApp phone</span>
        <input
          value={draft.phone}
          onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          inputMode="tel"
          autoComplete="off"
          maxLength={40}
          placeholder="201-555-0123"
          className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-lg outline-none focus:border-blue-600"
        />
      </label>
      <div>
        <span className="text-sm font-black text-slate-700">Language</span>
        <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Language">
          {CREW_LANGS.map((lang) => (
            <button
              key={lang.value}
              type="button"
              role="radio"
              aria-checked={draft.language === lang.value}
              onClick={() => setDraft({ ...draft, language: lang.value })}
              className={`min-h-[52px] rounded-xl text-base font-black ${draft.language === lang.value ? "bg-blue-600 text-white" : "border-2 border-slate-300 bg-white text-slate-700"}`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
      {tabChoices.length > 1 ? (
        <label className="block">
          <span className="text-sm font-black text-slate-700">Their checklist (optional)</span>
          <select
            value={draft.tabId ?? ""}
            onChange={(event) => setDraft({ ...draft, tabId: event.target.value ? Number(event.target.value) : null })}
            className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-lg"
          >
            <option value="">Any — they pick the tab</option>
            {tabChoices.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void saveDraft()} className="min-h-[52px] rounded-xl bg-blue-600 px-5 text-base font-black text-white hover:bg-blue-500 disabled:opacity-60">
          {busy ? "Saving…" : draft.id ? "Save" : "Add"}
        </button>
        <button type="button" disabled={busy} onClick={() => setDraft(null)} className="min-h-[52px] rounded-xl border-2 border-slate-300 bg-white px-5 text-base font-black text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {data.people.length === 0 && !draft ? <p className="text-base text-slate-600">No one on the crew list yet.</p> : null}

      {data.people.map((person) =>
        draft?.id === person.id ? (
          <div key={person.id}>{form}</div>
        ) : (
          <div key={person.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-black text-slate-900">
                  {person.name} <span className="text-sm font-bold text-slate-500">{LANG_SHORT[person.language]}</span>
                </p>
                <p className="text-sm text-slate-600">
                  {person.phone || "No phone"}
                  {tabName(person.tabId) ? ` · ${tabName(person.tabId)}` : ""}
                </p>
                <p className={`text-sm font-bold ${person.lastSentAt ? "text-green-700" : "text-slate-500"}`}>
                  {person.lastSentAt ? `✓ Sent ${whenLong(person.lastSentAt)}${person.lastSentBy ? ` by ${person.lastSentBy}` : ""}` : "Not sent yet"}
                </p>
              </div>
              {mode === "people" ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDraft({ id: person.id, name: person.name, phone: person.phone, language: person.language, tabId: person.tabId })} className="min-h-[44px] rounded-xl border-2 border-slate-300 px-3 text-sm font-black text-slate-700">
                    ✎ Edit
                  </button>
                  {confirmRemove === person.id ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void post({ action: "remove", id: person.id }).then(() => setConfirmRemove(null))}
                      className="min-h-[44px] rounded-xl bg-red-600 px-3 text-sm font-black text-white"
                    >
                      Yes, remove
                    </button>
                  ) : (
                    <button type="button" onClick={() => setConfirmRemove(person.id)} className="min-h-[44px] rounded-xl border-2 border-red-200 px-3 text-sm font-black text-red-600">
                      Remove
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {mode === "send" ? (
              <>
                <a
                  href={whatsappHref(person.phone, messageOf(person))}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sent(person, "whatsapp")}
                  className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-green-600 px-4 text-lg font-black text-white shadow-sm hover:bg-green-500"
                >
                  <span className="text-2xl" aria-hidden="true">🟢</span> {person.lastSentAt ? "Send again by WhatsApp" : "Send by WhatsApp"}
                </a>
                {!whatsappNumber(person.phone) ? <p className="text-sm text-slate-500">No phone saved: WhatsApp will ask who to send it to.</p> : null}
                <button type="button" onClick={() => setMoreFor(moreFor === person.id ? null : person.id)} aria-expanded={moreFor === person.id} className="text-sm font-bold text-blue-700 underline">
                  {moreFor === person.id ? "Fewer ways to send" : "More ways to send"}
                </button>
                {moreFor === person.id ? (
                  <a href={`mailto:?subject=${encodeURIComponent(`Cleaning World: ${placeName}`)}&body=${encodeURIComponent(messageOf(person))}`} onClick={() => sent(person, "copy")} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-black text-slate-800 ring-2 ring-slate-300">
                    ✉️ Send by email
                  </a>
                ) : null}
                {moreFor === person.id ? (
                  <CrewLinkShare
                    small
                    accountId={accountId}
                    placeName={placeName}
                    url={linkOf(person)}
                    message={messageOf(person)}
                    copyText={messageOf(person)}
                    copyLabel="Copy message"
                    textLabel="Send from my phone"
                    qrNote="Scan it with your phone, then share the link from there."
                    onShare={(method: ShareMethod) => sent(person, method === "text" ? "phone" : method)}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        )
      )}

      {draft && draft.id === null ? form : null}

      {mode === "people" && !draft ? (
        <button
          type="button"
          onClick={() => {
            setError("");
            setDraft({ ...EMPTY_DRAFT });
          }}
          className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl border-4 border-dashed border-blue-300 bg-white text-xl font-black text-blue-800 hover:bg-blue-50"
        >
          + Add person
        </button>
      ) : null}
    </div>
  );
}
