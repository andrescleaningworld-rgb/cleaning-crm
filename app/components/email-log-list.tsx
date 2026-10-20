"use client";

// The Email log list: Office -> Email log (every email), and the Email log
// tab on a sub's page (that sub only: its id, or its email for the old rows
// from the sheet). Newest first; search, type and sub filters; tapping a row
// shows exactly what was sent. Server: /api/admin/email-log.

import { useCallback, useEffect, useState } from "react";
import { BigButton, EmptyState, ErrorBox, Field, SelectField, Sheet, SkeletonList, StatusPill } from "@/app/ui";

type Row = {
  id: number;
  sentAt: string;
  channel: string;
  to: string;
  cc: string;
  subject: string;
  type: string;
  accountId: string;
  accountName: string;
  subId: string;
  subName: string;
  sentBy: string;
  status: "sent" | "failed";
  error: string;
  attachments: string;
  source: string;
  hasBody: boolean;
};

type Entry = Row & { html: string; text: string };
type SubOption = { id: string; email: string; label: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function EmailLogList({ subId = "", subEmail = "", accountId = "", showSubFilter = true }: { subId?: string; subEmail?: string; accountId?: string; showSubFilter?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "off" | "failed">("loading");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sub, setSub] = useState("");
  const [subs, setSubs] = useState<SubOption[]>([]);
  const [open, setOpen] = useState<Entry | null>(null);
  const [openError, setOpenError] = useState("");

  const pickedSub = subs.find((option) => option.id === sub);

  const load = useCallback(
    async (offset = 0) => {
      // On a sub's page with nothing to tell this sub apart: nothing, never every email.
      if (!showSubFilter && !subId && !subEmail && !accountId) {
        setRows([]);
        setTotal(0);
        setState("ready");
        return;
      }
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (type) params.set("type", type);
      if (subId || pickedSub) params.set("subId", subId || pickedSub?.id || "");
      if (subEmail || pickedSub?.email) params.set("subEmail", subEmail || pickedSub?.email || "");
      if (accountId) params.set("accountId", accountId);
      if (offset) params.set("offset", String(offset));
      try {
        const response = await fetch(`/api/admin/email-log?${params.toString()}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { success?: boolean; ready?: boolean; rows?: Row[]; total?: number; types?: string[] };
        if (!response.ok || !data.success) throw new Error("failed");
        if (!data.ready) return setState("off");
        setRows((current) => (offset ? [...current, ...(data.rows ?? [])] : data.rows ?? []));
        setTotal(data.total ?? 0);
        setTypes(data.types ?? []);
        setState("ready");
      } catch {
        setState((current) => (current === "ready" ? current : "failed"));
      }
    },
    [q, type, subId, subEmail, accountId, pickedSub, showSubFilter]
  );

  // A short wait after typing, so the search does not ask on every letter.
  useEffect(() => {
    const timer = setTimeout(() => void load(0), 300);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!showSubFilter || subId) return;
    fetch("/api/subcontractors", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { subcontractors?: Record<string, unknown>[] }) =>
        setSubs(
          (data.subcontractors ?? [])
            .map((row) => {
              const contact = String(row.contactName ?? "").trim();
              const company = String(row.companyName ?? "").trim();
              return { id: String(row.subId ?? row.id ?? "").trim(), email: String(row.email ?? "").trim(), label: contact && company && contact !== company ? `${contact} — ${company}` : contact || company };
            })
            .filter((option) => option.id && option.label)
            .sort((a, b) => a.label.localeCompare(b.label))
        )
      )
      .catch(() => setSubs([]));
  }, [showSubFilter, subId]);

  async function openRow(row: Row) {
    setOpenError("");
    try {
      const response = await fetch(`/api/admin/email-log?id=${row.id}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; entry?: Entry; error?: string };
      if (!response.ok || !data.success || !data.entry) throw new Error(data.error || "That email did not load.");
      setOpen(data.entry);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "That email did not load.");
    }
  }

  return (
    <div className="ui-stack">
      <div className="ui-stack">
        <Field label="Search" optional placeholder="Who it went to, subject, account, sub, who sent it" value={q} onChange={(event) => setQ(event.target.value)} />
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <SelectField label="Type" optional value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Every type</option>
            {types.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectField>
          {showSubFilter && !subId ? (
            <SelectField label="Sub" optional value={sub} onChange={(event) => setSub(event.target.value)}>
              <option value="">Every sub</option>
              {subs.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          ) : null}
        </div>
      </div>

      {openError ? <ErrorBox title="Not opened" text={openError} /> : null}

      {state === "off" ? (
        <EmptyState title="Not turned on here yet" text="The Email log works once this database has its table (migration 052)." />
      ) : state === "failed" ? (
        <ErrorBox title="The email log did not load." onRetry={() => void load(0)} />
      ) : state === "loading" ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState title="No emails found" text="Nothing matches. Clear the search or pick another type." />
      ) : (
        <>
          <p className="ui-muted">
            {total} email{total === 1 ? "" : "s"}, newest first. Tap one to see exactly what was sent.
          </p>
          <div className="overflow-x-auto">
            <table className="ui-table w-full">
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>To</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Sent by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="ui-table-rowlink" style={{ cursor: "pointer" }} onClick={() => void openRow(row)}>
                    <td className="whitespace-nowrap">
                      <button type="button" className="ui-link" onClick={(event) => (event.stopPropagation(), void openRow(row))}>
                        {when(row.sentAt)}
                      </button>
                    </td>
                    <td style={{ overflowWrap: "anywhere" }}>
                      {row.to}
                      {row.subName ? <span className="ui-muted"> ({row.subName})</span> : null}
                    </td>
                    <td>
                      {row.type || "-"}
                      {row.channel === "text" ? <span className="ui-muted"> · text</span> : null}
                    </td>
                    <td>{row.accountName || "-"}</td>
                    <td>{row.sentBy || "-"}</td>
                    <td>
                      <StatusPill kind={row.status === "sent" ? "done" : "needs-you"}>{row.status === "sent" ? "Sent" : "Failed"}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length < total ? (
            <BigButton kind="second" onClick={() => void load(rows.length)}>
              Show older
            </BigButton>
          ) : null}
        </>
      )}

      <Sheet open={open !== null} title={open?.subject || "Email"} text={open ? `${open.type || "Email"} · ${when(open.sentAt)}` : ""} onClose={() => setOpen(null)}>
        {open ? (
          <div className="ui-stack">
            <p className="ui-card-text">
              <strong>To:</strong> {open.to}
              {open.cc ? (
                <>
                  <br />
                  <strong>Copy to:</strong> {open.cc}
                </>
              ) : null}
              <br />
              <strong>Sent by:</strong> {open.sentBy || "-"}
              {open.accountName ? (
                <>
                  <br />
                  <strong>Account:</strong> {open.accountName}
                </>
              ) : null}
              {open.attachments ? (
                <>
                  <br />
                  <strong>Attached:</strong> {open.attachments}
                </>
              ) : null}
            </p>
            {open.status === "failed" ? <ErrorBox title="This one was not sent" text={open.error || "No reason was recorded."} /> : null}
            {open.html ? (
              <iframe title="The email as sent" sandbox="" srcDoc={open.html} style={{ width: "100%", height: 480, border: "1px solid var(--ui-line)", borderRadius: 12, background: "#fff" }} />
            ) : open.text ? (
              <pre className="ui-card-text" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", background: "var(--ui-surface-2)", borderRadius: 12, padding: 12 }}>
                {open.text}
              </pre>
            ) : (
              <p className="ui-muted">
                {open.source === "apps-script" ? "This one is from the old log (before Oct 9, 2026). Back then only who, when, the subject and the status were saved, not the email itself." : "The text of this email was not saved."}
              </p>
            )}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
