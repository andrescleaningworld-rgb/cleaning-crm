"use client";

// Contacts on a form that makes a new account (Add Account, New Accepted
// Account): the same idea as the Contacts card on Edit Account, before the
// account exists. The first contact is the main one: it fills the account's
// own Contact name / Phone / Email. "+ Add contact" adds more (name, role,
// phone, email); they are saved right after the account is made, through
// the same contacts API as Edit Account (saveExtraContacts below).

import { AddBar, AddButton, BigButton, Field, SelectField } from "@/app/ui";
import { OTHER, ROLES } from "./AccountContacts";

export type NewContact = { name: string; roleChoice: string; roleOther: string; phone: string; email: string };

export const emptyContact = (roleChoice = "Billing"): NewContact => ({ name: "", roleChoice, roleOther: "", phone: "", email: "" });

const roleOf = (contact: NewContact) => (contact.roleChoice === OTHER ? contact.roleOther.trim() : contact.roleChoice);
const hasAnything = (contact: NewContact) => [contact.name, contact.phone, contact.email].some((value) => value.trim());

/**
 * The main contact (first) and the extra ones. `main` is the account's own
 * three fields, so the form keeps them where it always has; `extras` are
 * the rest. showPhone: the New Accepted form asks no main phone.
 */
export default function NewAccountContacts({
  main,
  onMain,
  extras,
  onExtras,
  disabled = false,
  showPhone = true,
}: {
  main: { name: string; phone: string; email: string };
  onMain: (field: "name" | "phone" | "email", value: string) => void;
  extras: NewContact[];
  onExtras: (extras: NewContact[]) => void;
  disabled?: boolean;
  showPhone?: boolean;
}) {
  const change = (index: number, patch: Partial<NewContact>) => onExtras(extras.map((contact, i) => (i === index ? { ...contact, ...patch } : contact)));

  return (
    <div className="ui-stack">
      <AddBar>
        <AddButton onClick={() => onExtras([...extras, emptyContact(extras.length === 0 ? "Billing" : "Property/Site manager")])}>Add contact</AddButton>
      </AddBar>

      <p className="ui-label">Main contact</p>
      <Field label="Name" optional value={main.name} onChange={(event) => onMain("name", event.target.value)} disabled={disabled} />
      {showPhone ? <Field label="Phone" optional inputMode="tel" value={main.phone} onChange={(event) => onMain("phone", event.target.value)} disabled={disabled} /> : null}
      <Field
        label="Email"
        optional
        type="email"
        inputMode="email"
        autoComplete="off"
        hint="The Welcome Packet and the customer portal login use this email."
        value={main.email}
        onChange={(event) => onMain("email", event.target.value)}
        disabled={disabled}
      />

      {extras.map((contact, index) => (
        <div key={index} className="ui-stack" style={{ borderTop: "2px solid var(--ui-line-soft)", paddingTop: 12 }}>
          <p className="ui-label">Contact {index + 2}</p>
          <Field label="Name" optional value={contact.name} onChange={(event) => change(index, { name: event.target.value })} disabled={disabled} />
          <SelectField label="Role" value={contact.roleChoice} onChange={(event) => change(index, { roleChoice: event.target.value })} disabled={disabled}>
            {ROLES.filter((role) => role !== "Main contact").map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
            <option value={OTHER}>Other (type your own)</option>
          </SelectField>
          {contact.roleChoice === OTHER ? (
            <Field label="Role, in your words" maxLength={60} value={contact.roleOther} onChange={(event) => change(index, { roleOther: event.target.value })} disabled={disabled} />
          ) : null}
          <Field label="Phone" optional inputMode="tel" value={contact.phone} onChange={(event) => change(index, { phone: event.target.value })} disabled={disabled} />
          <Field label="Email" optional type="email" inputMode="email" autoComplete="off" value={contact.email} onChange={(event) => change(index, { email: event.target.value })} disabled={disabled} />
          <div className="ui-actions-row">
            <BigButton kind="quiet" disabled={disabled} onClick={() => onExtras(extras.filter((_, i) => i !== index))}>
              Remove this contact
            </BigButton>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Before saving: an extra contact with Other picked needs its role typed. "" when all is well. */
export function contactsProblem(extras: NewContact[]): string {
  const missingRole = extras.find((contact) => hasAnything(contact) && contact.roleChoice === OTHER && !contact.roleOther.trim());
  return missingRole ? "Type the role of each contact with Other, or pick one from the list." : "";
}

/**
 * After the account is made: each extra contact with something in it is
 * added to the account. Returns how many did not save (the account itself
 * is already saved; they can be added on Edit Account).
 */
export async function saveExtraContacts(accountId: string, extras: NewContact[]): Promise<number> {
  let failed = 0;
  for (const contact of extras.filter(hasAnything)) {
    try {
      const response = await fetch("/api/admin/account-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          accountId,
          contactId: null,
          name: contact.name.trim(),
          role: roleOf(contact),
          phone: contact.phone.trim(),
          email: contact.email.trim(),
          notes: "",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean };
      if (!response.ok || !data.success) failed += 1;
    } catch {
      failed += 1;
    }
  }
  return failed;
}
