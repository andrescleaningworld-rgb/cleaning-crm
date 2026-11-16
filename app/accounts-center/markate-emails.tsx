"use client";

// "Find emails in Markate" on Accounts Center → Missing emails. Read only
// until Save.
//
//   1. Downloads the whole Markate customer list: every page of Active,
//      Pending and Inactive (GET /api/admin/account-emails/markate?status=…),
//      a run of pages per call, with a pause between pages on the server.
//      The list is kept here for the run (cut down to name, address, phones,
//      emails), so matching never downloads it again.
//   2. Matches every account with no email against it, by phone, then
//      address, then name (lib/markateEmailMatch.ts).
//   3. Shows the count: customers downloaded, found by phone / address /
//      name, still missing, and the still-missing accounts with name and
//      phone, to look up in Markate by hand.
// If the list comes back empty, it falls back to looking each account up one
// by one (?search=1). Sure matches start ticked; Save saves the ticked ones
// with the usual Missing emails save.

import { useRef, useState } from "react";
import { BigButton, Card, ErrorBox, StatusPill, showToast } from "@/app/ui";
import AccountLink from "@/app/components/AccountLink";
import { matchAccounts, type EmailMatch, type MissingAccountRow, type SlimCustomer } from "@/lib/markateEmailMatch";

const STATUSES: { value: "1" | "4" | "3"; label: string }[] = [
  { value: "1", label: "Active" },
  { value: "4", label: "Pending" },
  { value: "3", label: "Inactive" },
];

type PagesReply = { success?: boolean; error?: string; customers: SlimCustomer[]; nextPage: number | null; totalPages: number; totalRows: number; answer: string };
type Report = {
  mode: "list" | "search";
  fetched: number;
  expected: number;
  byStatus: { label: string; fetched: number; total: number }[];
  accounts: number;
  matches: EmailMatch[];
  missing: MissingAccountRow[];
  answers: string[];
};

const WHY_TEXT: Record<EmailMatch["why"], string> = { phone: "phone", address: "address", name: "name" };

async function getJsonOnce<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as T & { success?: boolean; error?: string };
  if (!response.ok || !data.success) throw new Error(data.error || "Markate did not answer.");
  return data;
}

/** One request, tried again twice (after 5 s, then 20 s) before the run stops and offers Resume. */
async function getJson<T>(url: string): Promise<T> {
  const waits = [5_000, 20_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getJsonOnce<T>(url);
    } catch (error) {
      if (attempt >= waits.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    }
  }
}

/**
 * Where the download is: kept in this page's memory only (never in
 * localStorage or the database), so "Resume download" goes on from here
 * with what already came in. Closing or reloading the page starts over.
 */
type Cursor = {
  accounts: MissingAccountRow[] | null;
  statusIndex: number;
  page: number;
  size: number;
  fetchedThisStatus: number;
  totalThisStatus: number;
  byStatus: Report["byStatus"];
  answers: string[];
  expected: number;
};

const freshCursor = (): Cursor => ({ accounts: null, statusIndex: 0, page: 1, size: 100, fetchedThisStatus: 0, totalThisStatus: 0, byStatus: [], answers: [], expected: 0 });

export default function MarkateEmails({ onSaved }: { onSaved: (accountId: string) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [showMissing, setShowMissing] = useState(false);
  // The downloaded list, kept for the run in this page's memory only (not in
  // state: 49,000 rows would slow the screen; never in localStorage or the database).
  const customersRef = useRef<SlimCustomer[]>([]);
  const cursorRef = useRef<Cursor>(freshCursor());
  // The download stopped partway: Resume goes on from cursorRef.
  const [canResume, setCanResume] = useState(false);

  /** `resume`: go on from where the download stopped, keeping what came in. Otherwise start over. */
  async function find(resume = false) {
    setBusy(true);
    setError("");
    setCanResume(false);
    if (!resume) {
      setReport(null);
      setFailed({});
      customersRef.current = [];
      cursorRef.current = freshCursor();
    }
    const cursor = cursorRef.current;
    try {
      if (!cursor.accounts) {
        setProgress("Getting the Active accounts with no email…");
        cursor.accounts = (await getJson<{ accounts: MissingAccountRow[] }>("/api/admin/account-emails/markate?accounts=1")).accounts;
      }
      const accounts = cursor.accounts;

      // 1. Every page of every status, from the bookmark on.
      for (; cursor.statusIndex < STATUSES.length; cursor.statusIndex += 1) {
        const status = STATUSES[cursor.statusIndex];
        while (cursor.page > 0) {
          let reply: PagesReply = await getJson<PagesReply>(`/api/admin/account-emails/markate?status=${status.value}&page=${cursor.page}&size=${cursor.size}`);
          // Nothing at 100 a page while Markate says there are customers: ask again at 50 a page.
          if (cursor.page === 1 && reply.customers.length === 0 && reply.totalRows > 0 && cursor.size === 100) {
            cursor.size = 50;
            reply = await getJson<PagesReply>(`/api/admin/account-emails/markate?status=${status.value}&page=1&size=${cursor.size}`);
          }
          if (cursor.page === 1) {
            cursor.answers.push(`${status.label}: ${reply.answer}`);
            cursor.totalThisStatus = reply.totalRows;
            cursor.expected += reply.totalRows;
          }
          // Only once this run of pages is in does the bookmark move on, so a Resume never counts a page twice.
          customersRef.current.push(...reply.customers);
          cursor.fetchedThisStatus += reply.customers.length;
          cursor.page = reply.nextPage ?? 0;
          setProgress(
            `Downloading Markate customers: ${customersRef.current.length.toLocaleString()}${cursor.expected ? ` of about ${cursor.expected.toLocaleString()}` : ""} (${status.label}${cursor.totalThisStatus ? `: ${cursor.fetchedThisStatus.toLocaleString()} of ${cursor.totalThisStatus.toLocaleString()}` : ""})…`
          );
        }
        cursor.byStatus.push({ label: status.label, fetched: cursor.fetchedThisStatus, total: cursor.totalThisStatus });
        // The next status starts at its first page.
        cursor.page = 1;
        cursor.size = 100;
        cursor.fetchedThisStatus = 0;
        cursor.totalThisStatus = 0;
      }
      const { byStatus, answers, expected } = cursor;

      // 2. Match against the list, or look each account up when the list was empty.
      if (customersRef.current.length > 0) {
        setProgress("Matching…");
        const { matches, missing } = matchAccounts(accounts, customersRef.current);
        finish({ mode: "list", fetched: customersRef.current.length, expected, byStatus, accounts: accounts.length, matches, missing, answers });
      } else {
        const matches: EmailMatch[] = [];
        const missing: MissingAccountRow[] = [];
        for (let start: number | null = 0, rounds = 0; start !== null && rounds < 20; rounds += 1) {
          setProgress(`The Markate list came back empty. Looking up each account one by one: ${start} of ${accounts.length}…`);
          const round: { matches: EmailMatch[]; missing: MissingAccountRow[]; next: number | null } = await getJson(`/api/admin/account-emails/markate?search=1&start=${start}`);
          matches.push(...round.matches);
          missing.push(...round.missing);
          start = round.next;
        }
        finish({ mode: "search", fetched: 0, expected, byStatus, accounts: accounts.length, matches, missing, answers });
      }
    } catch (err) {
      // Stopped partway: what came in stays in memory, and Resume goes on from the bookmark.
      setCanResume(true);
      setError(
        `${err instanceof Error ? err.message : "Markate did not answer."} ${customersRef.current.length ? `${customersRef.current.length.toLocaleString()} customers came in before it stopped. ` : ""}Press Resume download to go on from there (keep this page open). Nothing was saved.`
      );
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  function finish(next: Report) {
    setReport(next);
    setTicked(new Set(next.matches.filter((m) => m.sure).map((m) => m.accountId)));
  }

  function toggle(id: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveTicked() {
    if (!report) return;
    setSaving(true);
    let saved = 0;
    const errors: Record<string, string> = {};
    for (const match of report.matches.filter((m) => ticked.has(m.accountId))) {
      try {
        const response = await fetch("/api/admin/account-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: match.accountId, email: match.email, onlyActive: true }),
        });
        const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (!response.ok || !data.success) throw new Error(data.error || "Not saved.");
        saved += 1;
        onSaved(match.accountId);
      } catch (err) {
        errors[match.accountId] = err instanceof Error ? err.message : "Not saved.";
      }
    }
    // The saved ones leave the list; the ones that failed stay, with why.
    setReport((current) => (current ? { ...current, matches: current.matches.filter((m) => !ticked.has(m.accountId) || errors[m.accountId]) } : current));
    setTicked(new Set(Object.keys(errors)));
    setFailed(errors);
    setSaving(false);
    const failedCount = Object.keys(errors).length;
    showToast(failedCount ? `Saved ${saved}. ${failedCount} did not save.` : `Saved ${saved} email${saved === 1 ? "" : "s"} ✓`, failedCount ? "bad" : undefined);
  }

  const matches = report?.matches ?? [];
  const count = (why: EmailMatch["why"]) => matches.filter((m) => m.why === why).length;

  return (
    <Card title="Find emails in Markate">
      <div className="ui-stack">
        <p className="ui-card-text">
          Downloads every Markate customer (Active, Pending and Inactive) and matches the Active accounts below by phone, address and name. Paused, suspended and inactive accounts are left out. Nothing is saved until you tick and press Save.
          Nothing changes in Markate. The whole list takes about 10–15 minutes: keep this page open.
        </p>
        {!report && !canResume ? (
          <div>
            <BigButton kind="second" busy={busy} busyLabel="Working…" onClick={() => void find()}>
              Find emails in Markate
            </BigButton>
          </div>
        ) : null}
        {progress ? (
          <p className="ui-strong" role="status">
            {progress}
          </p>
        ) : null}
        {error ? <ErrorBox title="Markate lookup did not finish" text={error} /> : null}
        {canResume && !busy ? (
          <div className="ui-actions-row">
            <BigButton onClick={() => void find(true)}>Resume download</BigButton>
            <BigButton kind="quiet" onClick={() => void find(false)}>
              Start over
            </BigButton>
          </div>
        ) : null}

        {report ? (
          <>
            <div className="ui-stats">
              <div className="ui-stat">
                <p className="ui-stat-label">Markate customers downloaded</p>
                <p className="ui-stat-value">{report.fetched.toLocaleString()}</p>
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Found by phone</p>
                <p className="ui-stat-value">{count("phone")}</p>
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Found by address</p>
                <p className="ui-stat-value">{count("address")}</p>
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Found by name (to confirm)</p>
                <p className="ui-stat-value">{count("name")}</p>
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Still missing</p>
                <p className="ui-stat-value">{report.missing.length}</p>
              </div>
            </div>
            <p className="ui-muted">
              {report.mode === "list"
                ? `${report.byStatus.map((s) => `${s.label} ${s.fetched.toLocaleString()} of ${s.total.toLocaleString()}`).join(" · ")}. Matched ${report.accounts} Active accounts with no email.`
                : `The Markate list came back empty, so each of the ${report.accounts} Active accounts was looked up one by one (by name and address only).`}
            </p>
            {report.fetched < report.expected ? (
              <p className="ui-field-error">
                Markate said there are {report.expected.toLocaleString()} customers but {report.fetched.toLocaleString()} came in. Press Look again; if it repeats, tell the office.
              </p>
            ) : null}
            {report.mode === "search" ? <p className="ui-muted">What Markate&apos;s list answered: {report.answers.join(" | ")}</p> : null}

            {matches.length > 0 ? (
              <>
                <div className="ui-actions-row">
                  <BigButton busy={saving} busyLabel="Saving…" disabled={ticked.size === 0} onClick={() => void saveTicked()}>
                    {`Save ${ticked.size} email${ticked.size === 1 ? "" : "s"}`}
                  </BigButton>
                  <BigButton kind="quiet" disabled={saving} onClick={() => setTicked(new Set(matches.map((m) => m.accountId)))}>
                    Tick all
                  </BigButton>
                  <BigButton kind="quiet" disabled={saving} onClick={() => setTicked(new Set())}>
                    Untick all
                  </BigButton>
                </div>
                <ul className="ui-stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {matches.map((m) => (
                    <li key={m.accountId} style={{ borderTop: "1px solid #dbeafe", paddingTop: 10 }}>
                      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                        <input type="checkbox" className="h-7 w-7 shrink-0" checked={ticked.has(m.accountId)} disabled={saving} onChange={() => toggle(m.accountId)} />
                        <span className="ui-stack" style={{ gap: 2 }}>
                          <span>
                            <AccountLink known accountId={m.accountId} name={m.accountName} />{" "}
                            <StatusPill kind={m.sure ? "done" : "waiting"}>
                              {`${m.sure ? "Sure" : "Check"} · by ${[m.why, ...m.alsoBy].map((w) => WHY_TEXT[w]).join(" + ")}`}
                            </StatusPill>
                          </span>
                          <span className="ui-strong">{m.email}</span>
                          <span className="ui-muted">
                            CRM: {m.accountAddress || "no address"}
                            {m.accountPhone ? ` · ${m.accountPhone}` : ""}
                          </span>
                          <span className="ui-muted">
                            Markate: {m.markateName || "no name"}
                            {m.markateAddress ? ` · ${m.markateAddress}` : ""}
                          </span>
                          {m.note ? <span className="ui-muted">⚠ {m.note}</span> : null}
                          {failed[m.accountId] ? <span className="ui-field-error">{failed[m.accountId]}</span> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="ui-muted">Markate has no email for these accounts.</p>
            )}

            {report.missing.length > 0 ? (
              <div className="ui-stack">
                <BigButton kind="second" onClick={() => setShowMissing((v) => !v)}>
                  {showMissing ? "Hide still missing" : `Show the ${report.missing.length} still missing (name and phone)`}
                </BigButton>
                {showMissing ? (
                  <table className="ui-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Account</th>
                        <th style={{ textAlign: "left" }}>Phone</th>
                        <th style={{ textAlign: "left" }}>Contact</th>
                        <th style={{ textAlign: "left" }}>Manager</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.missing.map((a) => (
                        <tr key={a.accountId}>
                          <td>
                            <AccountLink known accountId={a.accountId} name={a.accountName} />
                          </td>
                          <td>{a.phone || "No phone"}</td>
                          <td>{a.contactName || "-"}</td>
                          <td>{a.manager || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            ) : null}

            <div>
              <BigButton kind="quiet" busy={busy} busyLabel="Working…" disabled={saving} onClick={() => void find()}>
                Look again
              </BigButton>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
