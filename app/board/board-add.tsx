"use client";

// "Tap empty space in a box to add something there." One sheet, and what it
// asks depends on the box that was tapped:
//
//   a person's square  -> a new to-do, assigned to them, pinned on their square
//   Office             -> a new account update, pinned in the Office box
//   any other box      -> a simple sticky note that hangs in that box
//
// (Extra jobs and New accepted open their own full forms; see board-client.)
// The to-do and the account update are saved by their own APIs, exactly as
// from their own pages; this only also hangs the paper in the box.

import { useEffect, useState } from "react";
import { BigButton, CHEER, Field, SelectField, Sheet, TextAreaField, showToast } from "@/app/ui";
import type { BoardManager } from "@/lib/board";

export type AddTarget =
  | { kind: "todo"; manager: BoardManager }
  | { kind: "update" }
  | { kind: "note"; box: string; boxName: string };

type AccountOption = { id: string; name: string };

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

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export default function AddToBoxSheet({ target, me, onClose, onAdded }: { target: AddTarget | null; me: string; onClose: () => void; onAdded: () => void }) {
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [accountText, setAccountText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const kind = target?.kind ?? "";
  const needsAccounts = kind === "todo" || kind === "update";

  // Each opening starts fresh.
  useEffect(() => {
    if (!kind) return;
    setAccountId("");
    setTitle("");
    setType(kind === "update" ? "Other" : "Visit");
    setDueDate("");
    setNotes("");
    setAccountText("");
    setError("");
  }, [kind, target]);

  // The account list, the first time a form that needs it opens.
  useEffect(() => {
    if (!needsAccounts || accounts) return;
    let alive = true;
    fetch("/api/accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] }) => {
        if (!alive) return;
        const rows = (data.accounts ?? data.data ?? [])
          .filter((row) => !/cancel/i.test(pick(row, ["status", "Status"])))
          .map((row) => ({ id: pick(row, ["accountId", "id", "Account ID"]), name: pick(row, ["accountName", "Account Name", "name"]) }))
          .filter((row) => row.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        setAccounts(rows);
        setAccountsFailed(false);
      })
      .catch(() => alive && setAccountsFailed(true));
    return () => {
      alive = false;
    };
  }, [needsAccounts, accounts]);

  const account = accounts?.find((entry) => `${entry.id}|${entry.name}` === accountId) ?? null;

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
        setSaving(true);
        await post("/api/board", { action: "pin", kind: "note", text: title.trim(), accountName: accountText.trim(), dueDate, notes: notes.trim(), box: target.box });
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

  const accountField = (label: string) => (
    <SelectField label={label} value={accountId} onChange={(event) => setAccountId(event.target.value)} hint={accountsFailed ? "The account list did not load. Close this and try again." : accounts ? undefined : "Loading the accounts…"}>
      <option value="">Pick an account</option>
      {(accounts ?? []).map((entry) => (
        <option key={`${entry.id}|${entry.name}`} value={`${entry.id}|${entry.name}`}>
          {entry.name}
        </option>
      ))}
    </SelectField>
  );

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
            <Field label="Account (optional)" maxLength={120} value={accountText} onChange={(event) => setAccountText(event.target.value)} />
            <Field label="Due date (optional)" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            <TextAreaField label="Note (optional)" rows={3} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </>
        ) : null}
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}
