"use client";

// "Tap empty space in a box to add something there." One sheet, and what it
// asks depends on the box that was tapped:
//
//   a person's square  -> a new to-do, assigned to them, pinned on their square
//   Office             -> a new account update, pinned in the Office box
//   any other box      -> a simple sticky note that hangs in that box, with an
//                         optional account picked from the same search (saved
//                         by its ID, so the paper links to the account page)
//
// (Extra jobs and New accepted open their own full forms; see board-client.)
// The to-do and the account update are saved by their own APIs, exactly as
// from their own pages; this only also hangs the paper in the box.

import { useEffect, useState } from "react";
import AccountPickerField, { type PickedAccount } from "@/app/components/AccountPickerField";
import { BigButton, CHEER, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import type { BoardManager } from "@/lib/board";

export type AddTarget =
  | { kind: "todo"; manager: BoardManager }
  | { kind: "update" }
  | { kind: "note"; box: string; boxName: string };

const UPDATE_TYPES = ["Service Change", "Price Change", "Missed Visit", "Sub replacement", "Supplies", "Extra Service", "Approved", "Ongoing", "Other"];
// The same kinds the To-Do page offers.
const TODO_TYPES = ["Visit", "Complaint Follow-Up", "Account Follow-Up", "New Account Onboarding", "Customer Call", "Subcontractor Follow-Up", "Reminder", "Other"];

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success === false) {
    throw new Error(typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : "That did not save. Try again.");
  }
  return data;
}


export default function AddToBoxSheet({ target, me, onClose, onAdded }: { target: AddTarget | null; me: string; onClose: () => void; onAdded: () => void }) {
  const [account, setAccount] = useState<PickedAccount | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  // Goes up on each opening, so the account search starts empty too.
  const [opening, setOpening] = useState(0);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const kind = target?.kind ?? "";

  // Each opening starts fresh.
  useEffect(() => {
    if (!kind) return;
    setAccount(null);
    setAccountQuery("");
    setOpening((count) => count + 1);
    setTitle("");
    setType(kind === "update" ? "Other" : "Visit");
    setDueDate("");
    setNotes("");
    setError("");
  }, [kind, target]);

  async function save() {
    if (!target) return;
    setError("");
    try {
      if (target.kind === "todo") {
        if (!title.trim()) return setError("Write what needs doing.");
        if (!account) return setError("Pick the account it is for.");
        setSaving(true);
        const data = await post("/api/to-do", {
          action: "addToDos",
          accountNames: [account.name],
          accountIds: [account.id],
          dueDate,
          assignedTo: target.manager.name,
          taskType: type,
          why: title.trim(),
          notes: notes.trim(),
          status: "Open",
        });
        const id = Array.isArray(data.ids) ? String(data.ids[0] ?? "") : "";
        if (!id) throw new Error("The to-do was saved, but it could not be pinned. Find it on the To-Do page.");
        await post("/api/board", { action: "pinNew", type: "todo", recordId: id, title: [title.trim(), account.name].join(" · "), accountId: account.id, accountName: account.name, square: target.manager.id, forWho: target.manager.name, dueDate, notes: notes.trim() });
      } else if (target.kind === "update") {
        if (!account) return setError("Pick the account it is about.");
        if (!notes.trim()) return setError("Write what changed.");
        setSaving(true);
        const data = await post("/api/account-updates", { date: today(), accountName: account.name, accountId: account.id, updateType: type, manager: me, notes: notes.trim(), notifyEmail: "" });
        const id = String(data.id ?? "") || `new-${Date.now().toString(36)}`;
        await post("/api/board", { action: "pinNew", type: "update", recordId: id, title: `${type}: ${account.name}`, accountId: account.id, accountName: account.name, square: "", forWho: "Office", dueDate: "", notes: notes.trim() });
      } else {
        if (!title.trim()) return setError("Give the note a title.");
        // The account is optional, but words typed and not picked would be lost: ask to pick or clear.
        if (!account && accountQuery.trim()) return setError("Pick the account from the list, or clear the Account box.");
        setSaving(true);
        await post("/api/board", { action: "pin", kind: "note", text: title.trim(), accountId: account?.id ?? "", accountName: account?.name ?? "", dueDate, notes: notes.trim(), box: target.box });
      }
      showToast(CHEER.logged);
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const accountField = (label: string) => <AccountPickerField key={opening} label={label} value={account} onChange={setAccount} onQueryChange={setAccountQuery} />;

  const heading = !target ? "" : target.kind === "todo" ? `New to-do for ${target.manager.name}` : target.kind === "update" ? "New account update" : `New note in ${target.boxName}`;
  const text = !target ? "" : target.kind === "todo" ? `It is assigned to ${target.manager.name} and pinned on their square.` : target.kind === "update" ? "It is saved in Account Updates and pinned in the Office box." : "A sticky note. It hangs in this box until someone unpins it.";

  return (
    <Sheet
      open={Boolean(target)}
      title={heading}
      text={text}
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          Save
        </BigButton>
      }
    >
      <div className="ui-stack" data-add-kind={kind}>
        {kind === "todo" ? (
          <>
            <Field label="What needs doing?" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
            {accountField("Account")}
            <SelectField label="Kind" value={type} onChange={(event) => setType(event.target.value)}>
              {TODO_TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </SelectField>
            <Field label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            <TextAreaField label="Note (optional)" rows={2} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </>
        ) : kind === "update" ? (
          <>
            {accountField("Account")}
            <SelectField label="Kind of update" value={type} onChange={(event) => setType(event.target.value)}>
              {UPDATE_TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </SelectField>
            <TextAreaField label="What changed?" rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </>
        ) : kind === "note" ? (
          <>
            <Field label="Title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
            {accountField("Account (optional)")}
            <Field label="Due date (optional)" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            <TextAreaField label="Note (optional)" rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </>
        ) : null}
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}
