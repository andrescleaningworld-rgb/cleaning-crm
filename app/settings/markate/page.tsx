"use client";

// Settings -> Markate (owner only): connect Markate, and the line item names
// that count as recurring. Accepted commercial estimates with a recurring line
// item come into Accounts Center -> New accounts -> "From Markate" (checked
// every 30 minutes). Server: app/api/markate (lib/pg/markate.ts).

import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, EmptyState, ErrorBox, Field, Screen, SkeletonList, StatusPill, friendlyDate, showToast } from "@/app/ui";

type Status = { connected: boolean; connectedAt: string; connectedBy: string; lastCheckedAt: string; lastError: string; lastFound: number };

/** "Oct 22 at 3:30 PM". */
const whenText = (value: string) => `${friendlyDate(value)} at ${new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

/** What the last check did, in a few words. */
function lastResult(status: Status): string {
  if (status.lastError.startsWith("Stopped at the time limit")) return `It found ${status.lastFound} so far and stopped at the time limit. The next check goes on.`;
  if (status.lastError) return "";
  return status.lastFound === 0 ? "No new estimates." : `It found ${status.lastFound} new estimate${status.lastFound === 1 ? "" : "s"}.`;
}
type Item = { id: string; name: string; addedBy: string; addedAt: string };
/** What Check now looked at (lib/pg/markate.ts CheckResult): shown on this page only, not saved. */
type Seen = { number: string; status: string; customerType: string; items: string[]; outcome: "brought in" | "left out" | "already in the CRM"; kind: string; why: string };
type Lookup = { id: string; found: boolean; error: string; number: string; fields: string[]; day: string; countsAsAccepted: boolean; inLists: string[]; inCrm: string };
type CheckSummary = { checked: number; added: number; finished: boolean; since: string; notes: string[]; seen: Seen[]; leftOut: Record<string, number>; lookup: Lookup | null };

/** "12 left out: 8 residential, 3 not accepted, 1 no recurring item". */
function leftOutLine(leftOut: Record<string, number>): string {
  const parts = Object.entries(leftOut).sort((a, b) => b[1] - a[1]);
  const total = parts.reduce((sum, [, n]) => sum + n, 0);
  return total === 0 ? "None left out." : `${total} left out: ${parts.map(([kind, n]) => `${n} ${kind}`).join(", ")}.`;
}

function SeenRow({ seen }: { seen: Seen }) {
  return (
    <li className="ui-acct">
      <span className="ui-acct-name">{seen.number}</span>
      <span className="ui-actions-row">
        <StatusPill kind={seen.outcome === "brought in" ? "done" : seen.outcome === "left out" ? "off" : "waiting"}>
          {seen.outcome === "brought in" ? "Brought in" : seen.outcome === "left out" ? "Left out" : "Already in the CRM"}
        </StatusPill>
      </span>
      <span className="ui-acct-line">
        Status {seen.status} · Customer: {seen.customerType}
      </span>
      <span className="ui-acct-line">Items: {seen.items.length ? seen.items.join(", ") : "none listed"}</span>
      <span className="ui-acct-line ui-strong">{seen.why}</span>
    </li>
  );
}
type Settings = { ready: boolean; configured: boolean; status: Status; items: Item[] };

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/markate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(String(data.error ?? "That did not save. Try again."));
  return data;
}

export default function MarkateSettingsPage() {
  const [state, setState] = useState<"loading" | "ready" | "off" | "owner" | "failed">("loading");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [summary, setSummary] = useState<CheckSummary | null>(null);
  // Troubleshooting: one Markate estimate id to look up with Check now (optional).
  const [lookupId, setLookupId] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/markate?settings=1", { cache: "no-store" });
      if (response.status === 403) return setState("owner");
      const data = (await response.json().catch(() => ({}))) as Partial<Settings> & { success?: boolean };
      if (!response.ok || data.success !== true) throw new Error("failed");
      if (!data.ready) return setState("off");
      setSettings(data as Settings);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    // What Connect Markate came back with (?connected=1 or ?error=...), shown once.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") setNotice("Markate is connected.");
    if (params.get("error")) setError(params.get("error") ?? "");
    if (params.has("connected") || params.has("error")) window.history.replaceState(null, "", "/settings/markate");
    void load();
  }, [load]);

  async function run(key: string, body: Record<string, unknown>, done: string) {
    setError("");
    setBusy(key);
    try {
      const data = await post(body);
      if (Array.isArray(data.items) && settings) setSettings({ ...settings, items: data.items as Item[] });
      if (body.action === "checkNow") {
        const result = data.result as Partial<CheckSummary> | undefined;
        setSummary({
          checked: result?.checked ?? 0,
          added: result?.added ?? 0,
          finished: result?.finished !== false,
          since: result?.since ?? "",
          notes: result?.notes ?? [],
          seen: result?.seen ?? [],
          leftOut: result?.leftOut ?? {},
          lookup: result?.lookup ?? null,
        });
        showToast(`${result?.added ?? 0} new estimate${result?.added === 1 ? "" : "s"} found.${result?.finished === false ? " The rest come in on the next check." : ""}`);
        await load();
      } else if (body.action === "disconnect") {
        setNotice("");
        await load();
        showToast(done);
      } else {
        showToast(done);
      }
      if (body.action === "addItem") setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
      // A check that failed still ran: show its time and why.
      if (body.action === "checkNow") void load();
    } finally {
      setBusy("");
    }
  }

  const status = settings?.status;

  return (
    <Screen title="Markate" subtitle="Accepted commercial estimates with a recurring item come into New accounts." backHref="/settings">
      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "owner" ? (
        <EmptyState title="Only the owner can open this" text="Ask the owner to change the Markate settings." />
      ) : state === "off" ? (
        <EmptyState title="Not turned on here yet" text="Markate works once this database has the Markate tables." />
      ) : state === "failed" || !settings || !status ? (
        <ErrorBox title="Markate did not load." onRetry={() => void load()} />
      ) : (
        <>
          {notice ? <p className="ui-cheer">{notice}</p> : null}
          {error ? <ErrorBox title="Not done" text={error} /> : null}

          <Card title="Connection">
            {status.connected ? (
              <div className="ui-stack">
                <p className="ui-card-text">
                  <StatusPill kind="done">Connected</StatusPill> since {friendlyDate(status.connectedAt)}
                  {status.connectedBy ? ` (by ${status.connectedBy})` : ""}
                </p>
                {status.lastCheckedAt ? (
                  <p className="ui-card-text">
                    Last checked {whenText(status.lastCheckedAt)}. {lastResult(status)}
                  </p>
                ) : (
                  <p className="ui-card-text">Not checked yet. Tap Check now, or wait for the next check.</p>
                )}
                {status.lastError && !status.lastError.startsWith("Stopped at the time limit") ? <p className="ui-field-error">The last check did not finish: {status.lastError}</p> : null}
                <p className="ui-muted">It checks every 30 minutes. Only estimates accepted on or after Oct 22, 2026 come in.</p>
                <Field
                  label="Look up one Markate estimate"
                  optional
                  hint="For troubleshooting: the estimate's Markate id (a number). Check now then shows its status and dates."
                  inputMode="numeric"
                  value={lookupId}
                  disabled={busy !== ""}
                  onChange={(event) => setLookupId(event.target.value.replace(/\D/g, ""))}
                />
                <div className="ui-actions-row">
                  <BigButton kind="second" busy={busy === "check"} busyLabel="Checking…" disabled={busy !== ""} onClick={() => void run("check", { action: "checkNow", lookupId }, "")}>
                    Check now
                  </BigButton>
                  <BigButton kind="danger" busy={busy === "disconnect"} busyLabel="Disconnecting…" disabled={busy !== ""} onClick={() => void run("disconnect", { action: "disconnect" }, "Markate is disconnected.")}>
                    Disconnect
                  </BigButton>
                </div>
              </div>
            ) : (
              <div className="ui-stack">
                <p className="ui-card-text">Not connected. Log in to Markate once and the app checks for new estimates by itself.</p>
                {settings.configured ? (
                  <div>
                    {/* A plain link, not next/link: it leaves the app for Markate's login. */}
                    <a className="ui-btn ui-btn-main" href="/api/markate/connect">
                      Connect Markate
                    </a>
                  </div>
                ) : (
                  <p className="ui-field-error">The Markate app keys are missing here.</p>
                )}
              </div>
            )}
          </Card>

          {summary ? (
            <Card title="What Check now looked at">
              <p className="ui-card-text">
                Looked at {summary.checked} new estimate{summary.checked === 1 ? "" : "s"}
                {summary.since ? ` since ${friendlyDate(new Date(`${summary.since}T00:00:00`))}` : ""}. {summary.added} brought in.
                {summary.finished ? "" : " It stopped at the time limit; the next check goes on."}
              </p>
              {summary.seen.some((seen) => seen.outcome !== "left out") ? (
                <ul className="ui-acct-list" style={{ marginTop: 12 }}>
                  {summary.seen
                    .filter((seen) => seen.outcome !== "left out")
                    .map((seen, index) => (
                      <SeenRow key={`${seen.number}-${index}`} seen={seen} />
                    ))}
                </ul>
              ) : null}
              <p className="ui-card-text" style={{ marginTop: 12 }}>
                {leftOutLine(summary.leftOut)}
              </p>
              {/* Each list Markate sent: its size, the pages read, and page 1's first and last estimate (the real order). */}
              {summary.notes.map((note) => (
                <p key={note} className="ui-muted">
                  {note}
                </p>
              ))}

              {summary.lookup ? (
                <div className="ui-stack" style={{ marginTop: 12 }}>
                  <p className="ui-card-text ui-strong">
                    Looked up Markate id {summary.lookup.id}
                    {summary.lookup.number ? ` (${summary.lookup.number})` : ""}
                  </p>
                  {summary.lookup.found ? (
                    <>
                      <p className="ui-muted">
                        In the pages read: {summary.lookup.inLists.length ? "yes" : "no"}. Counts as accepted: {summary.lookup.countsAsAccepted ? "yes" : "no"}. Its day (Eastern):{" "}
                        {summary.lookup.day ? friendlyDate(new Date(`${summary.lookup.day}T00:00:00`)) : "none"}. In the CRM: {summary.lookup.inCrm || "not yet"}.
                      </p>
                      <ul className="ui-muted" style={{ margin: 0, paddingLeft: 18 }}>
                        {summary.lookup.fields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="ui-field-error">Not found: {summary.lookup.error || "Markate sent nothing."}</p>
                  )}
                </div>
              ) : null}

              <details style={{ marginTop: 12 }}>
                <summary className="ui-muted" style={{ cursor: "pointer" }}>
                  Show details
                </summary>
                {summary.seen.some((seen) => seen.outcome === "left out") ? (
                  <ul className="ui-acct-list" style={{ marginTop: 12 }}>
                    {summary.seen
                      .filter((seen) => seen.outcome === "left out")
                      .map((seen, index) => (
                        <SeenRow key={`${seen.number}-${index}`} seen={seen} />
                      ))}
                  </ul>
                ) : null}
              </details>
            </Card>
          ) : null}

          <Card title="Recurring items">
            <p className="ui-card-text">An estimate comes in when a line item has exactly one of these names (any capital letters).</p>
            <p className="ui-muted">Items that say &apos;per Month&apos; are always counted as recurring.</p>
            <form
              className="ui-stack"
              style={{ marginTop: 12 }}
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) return setError("Type the item name.");
                void run("add", { action: "addItem", name }, "Added.");
              }}
            >
              <Field label="Add an item" placeholder="Office Cleaning" value={name} maxLength={200} disabled={busy !== ""} onChange={(event) => setName(event.target.value)} />
              <div>
                <BigButton type="submit" icon="plus" busy={busy === "add"} busyLabel="Adding…" disabled={busy !== ""}>
                  Add
                </BigButton>
              </div>
            </form>
            {settings.items.length === 0 ? (
              <p className="ui-muted" style={{ marginTop: 12 }}>
                No items yet. Only &apos;per Month&apos; items count.
              </p>
            ) : (
              <ul className="ui-acct-list" style={{ marginTop: 12 }}>
                {settings.items.map((item) => (
                  <li key={item.id} className="ui-acct">
                    <span className="ui-acct-name">{item.name}</span>
                    <span className="ui-actions-row">
                      <BigButton kind="quiet" busy={busy === `remove-${item.id}`} busyLabel="Removing…" disabled={busy !== ""} onClick={() => void run(`remove-${item.id}`, { action: "removeItem", id: item.id }, `${item.name} removed.`)}>
                        Remove
                      </BigButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
