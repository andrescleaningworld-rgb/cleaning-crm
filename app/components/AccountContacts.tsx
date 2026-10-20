"use client";

// An account's contacts: the "Contacts" card on the account page and on Edit
// Account. Staff screens only.
//
//   one contact      shown simply, like before: name, phone, email. No list,
//                    no role labels.
//   two or more      a list, the main contact first with a star, each with
//                    its role. A phone taps to call, an email taps to write.
//
// "+ Add contact", Edit and Remove on each; "Make main" on the others. The
// main contact is the account's own contact (the customer portal login, the
// work order and the rest read it), so changing who is main, or the main
// contact's email, on an account with portal access asks first: "This
// changes who can log in to the customer portal."
//
// Where migration 034 is not in the database yet (or the contacts do not
// load), `fallback` shows instead: the screen's old three fields.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AddBar, AddButton, BigButton, Card, ConfirmSheet, Field, SelectField, Sheet, StatusPill, TextAreaField, showToast } from "@/app/ui";

export type Contact = { id: number | null; name: string; role: string; phone: string; email: string; notes: string; isMain: boolean };

export const ROLES = ["Main contact", "Billing", "Property/Site manager", "After-hours/Emergency", "Keys/Access"];
export const OTHER = "Other";

type Draft = { ref: number | "main" | null; name: string; roleChoice: string; roleOther: string; phone: string; email: string; notes: string };
/** What is waiting for "This changes who can log in to the customer portal". */
type Pending = { body: Record<string, unknown>; done: string };

const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;
const refOf = (contact: Contact): number | "main" => (contact.isMain ? "main" : (contact.id as number));

export default function AccountContacts({
  accountId,
  accountName,
  fallback = null,
  onMain,
  onReady,
}: {
  accountId: string;
  accountName: string;
  /** Shown when contacts are not available here. */
  fallback?: ReactNode;
  /** The main contact after every load and change: the page keeps its own copy of the account in step. */
  onMain?: (main: { name: string; phone: string; email: string }) => void;
  /** Called once the card is showing (so the page can drop its own contact lines). */
  onReady?: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [portalOn, setPortalOn] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Contact | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const take = useCallback(
    (list: Contact[], portal: boolean) => {
      setContacts(list);
      setPortalOn(portal);
      const main = list.find((contact) => contact.isMain);
      onMain?.({ name: main?.name ?? "", phone: main?.phone ?? "", email: main?.email ?? "" });
    },
    [onMain]
  );

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/admin/account-contacts?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { success?: boolean; ready?: boolean; contacts?: Contact[]; portalOn?: boolean }) => {
        if (!alive) return;
        if (body.success !== true || body.ready !== true) return setState("off");
        setContacts(body.contacts ?? []);
        setPortalOn(body.portalOn === true);
        setState("ready");
        onReady?.();
      })
      .catch(() => alive && setState("off"));
    return () => {
      alive = false;
    };
    // Loaded once for the account; later changes come back from each save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  /** Sends one change. When the server says the portal login would change, it waits for a yes and is sent again. */
  async function send(body: Record<string, unknown>, done: string): Promise<void> {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/account-contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, ...body }) });
      const answer = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; needsPortalConfirm?: boolean; contacts?: Contact[]; portalOn?: boolean };
      if (answer.needsPortalConfirm) {
        setPending({ body, done });
        return;
      }
      if (!response.ok || answer.success !== true) throw new Error(answer.error ?? "That did not save. Try again.");
      take(answer.contacts ?? [], answer.portalOn === true);
      setPending(null);
      setDraft(null);
      setRemoving(null);
      showToast(done);
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
      // A change made outside a sheet (Make main) has nowhere else to say it.
      if (!draft && !removing) showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;
  if (state === "off") return <>{fallback}</>;

  const startAdd = () => {
    setError("");
    setDraft({ ref: null, name: "", roleChoice: contacts.length === 0 ? "Main contact" : "Billing", roleOther: "", phone: "", email: "", notes: "" });
  };
  const startEdit = (contact: Contact) => {
    setError("");
    const known = ROLES.includes(contact.role);
    setDraft({ ref: refOf(contact), name: contact.name, roleChoice: known ? contact.role : contact.role ? OTHER : ROLES[0], roleOther: known ? "" : contact.role, phone: contact.phone, email: contact.email, notes: contact.notes });
  };
  const saveDraft = () => {
    if (!draft) return;
    const role = draft.roleChoice === OTHER ? draft.roleOther.trim() : draft.roleChoice;
    if (!draft.name.trim() && !draft.phone.trim() && !draft.email.trim()) return setError("Write a name, a phone or an email.");
    if (draft.roleChoice === OTHER && !role) return setError("Type the role, or pick one from the list.");
    void send({ action: "save", contactId: draft.ref, name: draft.name, role, phone: draft.phone, email: draft.email, notes: draft.notes }, draft.ref === null ? "Contact added ✓" : "Saved ✓");
  };

  const single = contacts.length === 1;
  const line = (contact: Contact) => (
    <>
      {contact.phone ? (
        <p style={{ margin: 0 }}>
          <a href={telHref(contact.phone)} className="ui-link">
            {contact.phone}
          </a>
        </p>
      ) : null}
      {contact.email ? (
        <p style={{ margin: 0 }}>
          <a href={`mailto:${contact.email}`} className="ui-link">
            {contact.email}
          </a>
        </p>
      ) : null}
      {contact.notes ? <p className="ui-muted" style={{ margin: 0 }}>{contact.notes}</p> : null}
    </>
  );

  return (
    // On Edit Account this card sits inside that page's form: Enter in one of its boxes must not save the whole account.
    <div
      data-account-contacts
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") event.preventDefault();
      }}
    >
      <Card title={single ? "Contact" : "Contacts"}>
        <div className="ui-stack">
          <div className="account-detail-print-hide">
            <AddBar>
              <AddButton onClick={startAdd}>Add contact</AddButton>
            </AddBar>
          </div>
          {contacts.length === 0 ? <p className="ui-muted">No contact on file.</p> : null}

          {single ? (
            // One contact: as simple as it always was. No list, no role labels.
            <div data-contact="main">
              <p className="ui-strong" style={{ margin: 0 }}>
                {contacts[0].name || "No name"}
              </p>
              {line(contacts[0])}
              <div className="ui-actions-row account-detail-print-hide" style={{ marginTop: 8 }}>
                <BigButton kind="second" onClick={() => startEdit(contacts[0])}>
                  Edit
                </BigButton>
              </div>
            </div>
          ) : (
            contacts.map((contact) => (
              <div key={contact.id ?? "main"} className="ui-stat" data-contact={contact.isMain ? "main" : contact.id}>
                <div className="ui-card-row">
                  <p className="ui-strong" style={{ margin: 0 }}>
                    {contact.name || "No name"}
                  </p>
                  {contact.isMain ? <StatusPill kind="done">★ Main</StatusPill> : null}
                </div>
                {contact.role ? <p className="ui-card-text" style={{ margin: 0 }}>{contact.role}</p> : null}
                {line(contact)}
                <div className="ui-actions-row account-detail-print-hide" style={{ marginTop: 8 }}>
                  <BigButton kind="second" onClick={() => startEdit(contact)}>
                    Edit
                  </BigButton>
                  {!contact.isMain ? (
                    <BigButton kind="second" disabled={busy} onClick={() => void send({ action: "makeMain", contactId: contact.id }, `${contact.name || "This contact"} is now the main contact ✓`)}>
                      Make main
                    </BigButton>
                  ) : null}
                  {!contact.isMain ? (
                    <BigButton
                      kind="quiet"
                      onClick={() => {
                        setError("");
                        setRemoving(contact);
                      }}
                    >
                      Remove
                    </BigButton>
                  ) : null}
                </div>
              </div>
            ))
          )}

          {single ? (
            <div className="ui-actions-row account-detail-print-hide">
              <BigButton
                kind="quiet"
                onClick={() => {
                  setError("");
                  setRemoving(contacts[0]);
                }}
              >
                Remove
              </BigButton>
            </div>
          ) : null}
        </div>
      </Card>

      <Sheet
        open={draft !== null}
        title={draft?.ref === null ? "Add contact" : "Edit contact"}
        text={accountName}
        onClose={() => setDraft(null)}
        busy={busy}
        actions={
          <BigButton busy={busy} busyLabel="Saving…" onClick={saveDraft}>
            Save
          </BigButton>
        }
      >
        {draft ? (
          <div className="ui-stack">
            <Field label="Name" maxLength={120} value={draft.name} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <SelectField label="Role" value={draft.roleChoice} disabled={busy} onChange={(event) => setDraft({ ...draft, roleChoice: event.target.value })}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
              <option value={OTHER}>Other (type your own)</option>
            </SelectField>
            {draft.roleChoice === OTHER ? <Field label="Role, in your words" maxLength={60} value={draft.roleOther} disabled={busy} onChange={(event) => setDraft({ ...draft, roleOther: event.target.value })} /> : null}
            <Field label="Phone" optional inputMode="tel" maxLength={60} value={draft.phone} disabled={busy} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
            <Field label="Email" optional inputMode="email" maxLength={200} value={draft.email} disabled={busy} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
            <TextAreaField label="Notes" optional rows={2} maxLength={1000} value={draft.notes} disabled={busy} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            {draft.ref === "main" && portalOn ? <p className="ui-muted">This is the main contact. Its email is the customer portal login for this account.</p> : null}
            {error ? <p className="ui-field-error">{error}</p> : null}
          </div>
        ) : null}
      </Sheet>

      <ConfirmSheet
        open={removing !== null && pending === null}
        title="Remove this contact?"
        text={removing ? `${removing.name || "This contact"} comes off ${accountName}.${error ? ` ${error}` : ""}` : ""}
        confirmLabel="Remove contact"
        busy={busy}
        busyLabel="Removing…"
        onConfirm={() => removing && void send({ action: "remove", contactId: refOf(removing) }, "Contact removed.")}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmSheet
        open={pending !== null}
        title="This changes who can log in to the customer portal."
        text={`${accountName} has customer portal access. The main contact's email is its login, so after this change a different email (or none) can log in.`}
        confirmLabel="Yes, change it"
        busy={busy}
        busyLabel="Saving…"
        onConfirm={() => pending && void send({ ...pending.body, confirmPortal: true }, pending.done)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
