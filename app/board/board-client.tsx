"use client";

// The Office Pin Board for staff: Whole board and My square. Calendar and
// TV mode are their own pages, reached from the same tabs.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccountPicker,
  BigButton,
  CHEER,
  EmptyState,
  ErrorBox,
  MOTTO,
  Screen,
  SelectField,
  Sheet,
  SkeletonList,
  Tabs,
  TextAreaField,
  friendlyDate,
  showToast,
  type PickerOption,
} from "@/app/ui";
import { KIND_LABEL, daysLabel, daysPinned, isOld, type BoardData, type Paper } from "@/lib/board";
import BoardCanvas from "./board-canvas";
import styles from "./board.module.css";

export type BoardTab = "board" | "mine" | "calendar" | "tv";

export const BOARD_TABS: { value: BoardTab; label: string }[] = [
  { value: "board", label: "Whole board" },
  { value: "mine", label: "My square" },
  { value: "calendar", label: "Calendar" },
  { value: "tv", label: "TV mode" },
];

/** The tabs are the same on /board and /board/calendar; two of them are pages of their own. */
export function useBoardTabs(current: BoardTab, onLocal?: (tab: "board" | "mine") => void) {
  const router = useRouter();
  return (tab: BoardTab) => {
    if (tab === current) return;
    if (tab === "calendar") router.push("/board/calendar");
    else if (tab === "tv") router.push("/board/tv");
    else if (onLocal) onLocal(tab);
    else router.push(tab === "mine" ? "/board?tab=mine" : "/board");
  };
}

type State = "loading" | "off" | "failed" | "ready";

export async function postBoard(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "That did not save. Try again.");
  return data;
}

export default function BoardClient({ startTab }: { startTab: "board" | "mine" }) {
  const [state, setState] = useState<State>("loading");
  const [data, setData] = useState<BoardData | null>(null);
  const [tab, setTab] = useState<"board" | "mine">(startTab);
  const [openKey, setOpenKey] = useState("");
  const [pinning, setPinning] = useState<"" | "note" | "extra">("");
  const [trayOpen, setTrayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [whose, setWhose] = useState("");
  const changeTab = useBoardTabs(tab, setTab);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<BoardData>;
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) {
        setState("off");
        return;
      }
      setData({ settings: body.settings!, me: body.me!, managers: body.managers ?? [], papers: body.papers ?? [], done: body.done ?? [] });
      setState("ready");
    } catch {
      setState((current) => (current === "ready" ? current : "failed"));
    }
  }, []);

  // New papers pin themselves, so the board looks again every minute.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // A paper whose manager is no longer on the board goes back to its shared square.
  const papers = useMemo(() => {
    if (!data) return [];
    const squares = new Set(data.managers.map((manager) => manager.id));
    return data.papers.map((paper) => (paper.square && !squares.has(paper.square) ? { ...paper, square: "" } : paper));
  }, [data]);

  const open = papers.find((paper) => `${paper.kind}:${paper.itemId}` === openKey) ?? null;
  const mySquare = data?.me.squareId || whose;
  const mine = papers.filter((paper) => mySquare !== "" && paper.square === mySquare);
  const managerName = (id: string) => data?.managers.find((manager) => manager.id === id)?.name ?? "";

  async function act(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await postBoard(body);
      await load();
      showToast(message);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const move = (paper: Paper, square: string) =>
    void act({ action: "move", kind: paper.kind, itemId: paper.itemId, square }, square ? `Handed to ${managerName(square)}` : "Back in the shared square");
  const take = (paper: Paper, on: boolean) => act({ action: "take", kind: paper.kind, itemId: paper.itemId, on }, on ? "Got it. The pin is green." : "Given back. The pin is red.");
  const finish = async (paper: Paper, on: boolean) => {
    const ok = await act({ action: "done", kind: paper.kind, itemId: paper.itemId, on }, on ? "Done. It is in the Done tray." : "Pinned back on the board.");
    if (ok && on) setOpenKey("");
  };

  return (
    <Screen title="Pin Board">
      <p className={styles.motto}>{MOTTO.en}</p>
      <Tabs tabs={BOARD_TABS} value={tab} onChange={changeTab} label="Pin Board views" />

      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="Not turned on here yet" text="The Pin Board works once it is switched on and this database has its tables." />
      ) : state === "failed" || !data ? (
        <ErrorBox title="The board did not load." onRetry={() => void load()} />
      ) : (
        <>
          <div className={styles.actions}>
            <BigButton icon="plus" onClick={() => setPinning("note")}>
              Pin something
            </BigButton>
            <BigButton icon="plus" onClick={() => setPinning("extra")}>
              Extra job
            </BigButton>
          </div>

          {tab === "board" ? (
            <>
              <BoardCanvas papers={papers} managers={data.managers} settings={data.settings} mySquare={data.me.squareId} onOpen={(paper) => setOpenKey(`${paper.kind}:${paper.itemId}`)} onMove={move} />
              <p className="ui-muted">Tap a paper to open it. Drag it into a square to hand it off (on a phone, hold it first).</p>
            </>
          ) : (
            <MySquare
              papers={mine}
              data={data}
              whose={mySquare}
              onWhose={data.me.squareId ? undefined : setWhose}
              busy={busy}
              onOpen={(paper) => setOpenKey(`${paper.kind}:${paper.itemId}`)}
              onTake={(paper) => void take(paper, true)}
              onDone={(paper) => void finish(paper, true)}
            />
          )}

          <div className={styles.trayButton}>
            <BigButton kind="second" onClick={() => setTrayOpen(true)}>
              Done tray ({data.done.length})
            </BigButton>
          </div>
          {data.me.isOwner ? (
            <p>
              <a className="ui-link" href="/settings/board">
                Pin Board settings and TV links
              </a>
            </p>
          ) : null}
        </>
      )}

      {/* One paper, opened. */}
      <Sheet open={Boolean(open)} title={open ? open.title || KIND_LABEL[open.kind] : ""} onClose={() => setOpenKey("")} closeLabel="Close" busy={busy}>
        {open && data ? (
          <div className="ui-stack">
            <p className={styles.sheetLine}>
              <strong>{KIND_LABEL[open.kind]}</strong>
              {open.accountName && open.accountName !== open.title ? ` for ${open.accountName}` : ""}
            </p>
            {open.detail ? <p className={styles.sheetLine}>{open.detail}</p> : null}
            <p className="ui-muted">
              Pinned {friendlyDate(open.pinnedAt)}
              {open.pinnedBy ? ` by ${open.pinnedBy}` : ""}. {isOld(open, data.settings) ? `On the board ${daysLabel(daysPinned(open))}.` : ""}
            </p>
            {open.progress ? (
              <p className={styles.sheetLine}>
                Checklist: {open.progress.done} of {open.progress.total} done
              </p>
            ) : null}
            <p className={styles.sheetLine}>{open.takenAt ? `${open.takenBy} has it.` : "Nobody has taken it yet."}</p>

            <div className={styles.sheetButtons}>
              {open.href ? (
                <BigButton href={open.href}>{open.kind === "account" ? "Open checklist" : open.kind === "complaint" ? "Open complaints" : open.kind === "order" ? "Open order" : "Open account"}</BigButton>
              ) : null}
              {open.takenAt ? (
                <BigButton kind="second" disabled={busy} onClick={() => void take(open, false)}>
                  Give it back
                </BigButton>
              ) : (
                <BigButton kind={open.href ? "second" : "main"} disabled={busy} onClick={() => void take(open, true)}>
                  Got it
                </BigButton>
              )}
              <BigButton kind="second" icon="check" disabled={busy} onClick={() => void finish(open, true)}>
                Done
              </BigButton>
            </div>

            <p className="ui-label">Hand it to</p>
            <div className={styles.give}>
              {data.managers
                .filter((manager) => manager.id !== open.square)
                .map((manager) => (
                  <BigButton key={manager.id} kind="second" disabled={busy} onClick={() => move(open, manager.id)}>
                    {manager.name}
                  </BigButton>
                ))}
              {open.square && open.kind !== "note" ? (
                <BigButton kind="quiet" disabled={busy} onClick={() => move(open, "")}>
                  Shared square
                </BigButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* The Done tray: who unpinned what, and when. */}
      <Sheet open={trayOpen} title="Done tray" text="Unpinned in the last 30 days, newest first." onClose={() => setTrayOpen(false)} closeLabel="Close" busy={busy}>
        {data && data.done.length === 0 ? <p className="ui-muted">Nothing has been unpinned yet.</p> : null}
        {data?.done.map((paper) => (
          <div key={`${paper.kind}:${paper.itemId}`} className={styles.trayRow}>
            <div>
              <p className="ui-strong">{paper.title || KIND_LABEL[paper.kind]}</p>
              <p className="ui-muted">
                {KIND_LABEL[paper.kind]}. Done {friendlyDate(paper.doneAt)}
                {paper.doneBy ? ` by ${paper.doneBy}` : ""}.
              </p>
            </div>
            <BigButton kind="second" disabled={busy} onClick={() => void finish(paper, false)}>
              Pin back
            </BigButton>
          </div>
        ))}
      </Sheet>

      {data ? <PinSheet mode={pinning} data={data} defaultSquare={data.me.squareId} onClose={() => setPinning("")} onPinned={() => void load()} /> : null}
    </Screen>
  );
}

/* ---------- My square: only my papers, oldest first ---------- */

function MySquare({
  papers,
  data,
  whose,
  onWhose,
  busy,
  onOpen,
  onTake,
  onDone,
}: {
  papers: Paper[];
  data: BoardData;
  whose: string;
  /** Office staff have no square of their own, so they pick whose to look at. */
  onWhose?: (id: string) => void;
  busy: boolean;
  onOpen: (paper: Paper) => void;
  onTake: (paper: Paper) => void;
  onDone: (paper: Paper) => void;
}) {
  return (
    <div className="ui-stack">
      {onWhose ? (
        <SelectField label="Whose square" hint="You have no square of your own. Pick a manager to see theirs." value={whose} onChange={(event) => onWhose(event.target.value)}>
          <option value="">Pick a manager</option>
          {data.managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </SelectField>
      ) : null}
      {whose && papers.length === 0 ? <EmptyState title="Nothing pinned here" text="When someone hands off a paper, it shows up here." icon="check" /> : null}
      {papers.map((paper) => {
        const days = daysPinned(paper);
        return (
          <article key={`${paper.kind}:${paper.itemId}`} className={`${styles.mineCard} ${styles[paper.kind]}`}>
            <div className="ui-actions-row">
              <span className={styles.mineTag}>{KIND_LABEL[paper.kind]}</span>
              {isOld(paper, data.settings) ? <span className={styles.mineTagOld}>{daysLabel(days)}</span> : <span className="ui-muted">{days === 0 ? "Today" : daysLabel(days)}</span>}
            </div>
            <h2 className={styles.mineTitle}>{paper.title || KIND_LABEL[paper.kind]}</h2>
            {paper.detail ? <p className="ui-card-text">{paper.detail}</p> : null}
            {paper.progress ? (
              <p className="ui-card-text">
                Checklist: {paper.progress.done} of {paper.progress.total} done
              </p>
            ) : null}
            <p className="ui-muted">{paper.takenAt ? `${paper.takenBy} has it.` : "Nobody has taken it yet."}</p>
            <div className={styles.sheetButtons}>
              {paper.takenAt ? null : (
                <BigButton disabled={busy} onClick={() => onTake(paper)}>
                  Got it
                </BigButton>
              )}
              <BigButton kind="second" onClick={() => onOpen(paper)}>
                Open
              </BigButton>
              <BigButton kind="second" icon="check" disabled={busy} onClick={() => onDone(paper)}>
                Done
              </BigButton>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---------- "+ Pin something" and "+ Extra job" ---------- */

function PinSheet({ mode, data, defaultSquare, onClose, onPinned }: { mode: "" | "note" | "extra"; data: BoardData; defaultSquare: string; onClose: () => void; onPinned: () => void }) {
  const [text, setText] = useState("");
  const [square, setSquare] = useState(defaultSquare);
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<PickerOption[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Each opening starts fresh.
  useEffect(() => {
    if (!mode) return;
    setText("");
    setSquare(mode === "note" ? defaultSquare : "");
    setAccountId("");
    setError("");
  }, [mode, defaultSquare]);

  // The account names, the first time an extra job is added.
  useEffect(() => {
    if (mode !== "extra" || accounts) return;
    fetch("/api/board?view=accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { accounts?: PickerOption[] }) => setAccounts(body.accounts ?? []))
      .catch(() => setAccounts([]));
  }, [mode, accounts]);

  async function save() {
    setError("");
    const account = accounts?.find((option) => option.id === accountId);
    if (mode === "note" && !text.trim()) return setError("Write what needs doing.");
    if (mode === "note" && !square) return setError("Pick whose square it goes in.");
    if (mode === "extra" && !account && !text.trim()) return setError("Pick the account or write what the job is.");
    setSaving(true);
    try {
      await postBoard({ action: "pin", kind: mode, text, square, accountId: account?.id ?? "", accountName: account?.name ?? "" });
      showToast(CHEER.logged);
      onPinned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={mode !== ""}
      title={mode === "extra" ? "Extra job" : "Pin something"}
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Pinning…" onClick={() => void save()}>
          Pin it
        </BigButton>
      }
    >
      <div className="ui-stack">
        {mode === "extra" ? (
          accounts === null ? (
            <SkeletonList rows={1} />
          ) : (
            <AccountPicker options={accounts} value={accountId} onChange={setAccountId} label="Account" searchLabel="Find an account" emptyText="No account with that name." />
          )
        ) : null}
        <TextAreaField label={mode === "extra" ? "What is the job?" : "What needs doing?"} rows={3} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
        <SelectField label={mode === "extra" ? "Who does it" : "Whose square"} optional={mode === "extra"} value={square} onChange={(event) => setSquare(event.target.value)}>
          <option value="">{mode === "extra" ? "Nobody yet (Extra jobs square)" : "Pick a manager"}</option>
          {data.managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </SelectField>
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Sheet>
  );
}
