"use client";

// The Office Pin Board for staff: Whole board and My square. Calendar and
// TV mode are their own pages, reached from the same tabs.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AddButton,
  BigButton,
  CHEER,
  EmptyState,
  ErrorBox,
  Field,
  MOTTO,
  Screen,
  SelectField,
  Sheet,
  SkeletonList,
  Tabs,
  TextAreaField,
  Tips,
  friendlyDate,
  showToast,
} from "@/app/ui";
import { BOARD_FROM_KEY, BOARD_SCROLL_KEY, KIND_LABEL, NOTE_BOXES, SHARED_SQUARES, daysLabel, daysPinned, dueLabel, isOld, isOverdue, paperLabel, statusLine, type BoardData, type Paper } from "@/lib/board";
import AddToBoxSheet, { type AddTarget } from "./board-add";
import BoardCanvas from "./board-canvas";
import PinStatusBox from "./pin-status";
import AccountLink from "../components/AccountLink";
import PizzaTracker from "../components/pizza-tracker";
import { StuckNote, setupStepsText } from "../components/account-flow";
import { SetupButton } from "../components/OnboardingChecklist";
import OnboardingWizardModal from "../components/OnboardingWizardModal";
import ReadyBadge from "../components/ready-badge";
import AccountPickerField, { type PickedAccount } from "../components/AccountPickerField";
import { enterFullScreen } from "./full-screen";
import styles from "./board.module.css";

export type BoardTab = "board" | "mine" | "calendar" | "tv";

/** A blue paper that mirrors a real extra job: it is finished on the job's page (Done ✓ in its popup goes there), never with Unpin. */
const isExtraJob = (paper: Paper) => paper.kind === "extra" && paper.itemId.startsWith("job-");

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
    else if (tab === "tv") {
      // Full screen has to start inside this click; it stays on while the TV page opens.
      void enterFullScreen();
      router.push("/board/tv");
    }
    else if (onLocal) onLocal(tab);
    else router.push(tab === "mine" ? "/board?tab=mine" : "/board?tab=board");
  };
}

type State = "loading" | "off" | "failed" | "ready";

export async function postBoard(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "That did not save. Try again.");
  return data;
}

export default function BoardClient({ startTab, phoneOpensMine = false }: { startTab: "board" | "mine"; phoneOpensMine?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const router = useRouter();
  const restored = useRef(false);
  const [data, setData] = useState<BoardData | null>(null);
  const [tab, setTab] = useState<"board" | "mine">(startTab);
  const [openKey, setOpenKey] = useState("");
  const [pinning, setPinning] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  // "Tap empty space in a box to add something there": the box that was tapped.
  const [adding, setAdding] = useState<AddTarget | null>(null);
  // "Show on TV": open, and the code a scanned QR brought along (/board?tv=123456).
  const [tvOpen, setTvOpen] = useState(false);
  const [tvCode, setTvCode] = useState("");
  useEffect(() => {
    const code = (new URLSearchParams(window.location.search).get("tv") ?? "").replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) return;
    setTvCode(code);
    setTvOpen(true);
    // The code is used once: it does not stay in the address.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [busy, setBusy] = useState(false);
  const [whose, setWhose] = useState("");
  // The setup wizard for a new-account pin. The pin's panel closes while it is open and comes back after.
  const [setupFor, setSetupFor] = useState<{ accountId: string; accountName: string; paperKey: string } | null>(null);
  const changeTab = useBoardTabs(tab, setTab);

  // fresh: the board lines itself up with the records right now (back from an extra job marked Done), instead of within 15 seconds.
  const load = useCallback(async (fresh = false) => {
    try {
      const response = await fetch(fresh ? "/api/board?fresh=1" : "/api/board", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<BoardData>;
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) {
        setState("off");
        return;
      }
      setData({ settings: body.settings!, me: body.me!, managers: body.managers ?? [], papers: body.papers ?? [], done: body.done ?? [], statusOn: body.statusOn === true });
      setState("ready");
    } catch {
      setState((current) => (current === "ready" ? current : "failed"));
    }
  }, []);

  // "Board" in the menu: on a phone it opens My square (a list), not the whole cork board.
  useEffect(() => {
    if (phoneOpensMine && window.matchMedia("(max-width: 640px)").matches) setTab("mine");
  }, [phoneOpensMine]);

  // New papers pin themselves, so the board looks again every minute.
  useEffect(() => {
    // Back from an extra job's page (it may have just been marked Done there): its paper comes down on this first look.
    let backFromJob = false;
    try {
      backFromJob = (window.sessionStorage.getItem(BOARD_FROM_KEY) ?? "").startsWith("/extra-jobs/");
    } catch {
      // No storage: the usual look.
    }
    void load(backFromJob);
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
    void act({ action: "move", kind: paper.kind, itemId: paper.itemId, square }, square ? `Handed to ${managerName(square)}` : paper.kind === "note" ? "Moved to Office" : "Back in the shared square");
  const take = (paper: Paper, on: boolean) => act({ action: "take", kind: paper.kind, itemId: paper.itemId, on }, on ? "Got it. The pin is green." : "Given back. The pin is red.");
  // Tap = deep dive: a paper that points at a record opens that exact record.
  // The board's place is remembered, so the back arrow returns to the same spot.
  const loaded = data !== null;
  useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;
    try {
      const saved = Number(window.sessionStorage.getItem(BOARD_SCROLL_KEY));
      window.sessionStorage.removeItem(BOARD_SCROLL_KEY);
      window.sessionStorage.removeItem(BOARD_FROM_KEY);
      if (Number.isFinite(saved) && saved > 0) window.requestAnimationFrame(() => window.scrollTo({ top: saved }));
    } catch {
      // No storage: the board starts at the top.
    }
  }, [loaded]);

  // A tap opens the note as a large card. "Open full details" on the card goes to the item itself.
  const openPaper = (paper: Paper) => setOpenKey(`${paper.kind}:${paper.itemId}`);

  // section: a part of that page to open at, e.g. "#done" (an extra job's Done section).
  const openDetails = (paper: Paper, section = "") => {
    if (!paper.href) return;
    try {
      window.sessionStorage.setItem(BOARD_SCROLL_KEY, String(window.scrollY));
      window.sessionStorage.setItem(BOARD_FROM_KEY, paper.href.split("?")[0]);
    } catch {
      // No storage: it still opens; the board simply starts at the top afterwards.
    }
    router.push(`${paper.href}${section}`);
  };

  // Tap empty space in a box: the right form for that box, already filled in for it.
  const addTo = (square: string) => {
    if (!data) return;
    if (square.startsWith("mgr:")) {
      const manager = data.managers.find((entry) => entry.id === square.slice(4));
      if (manager) setAdding({ kind: "todo", manager });
      return;
    }
    const box = square.slice("shared:".length);
    if (box === "note") return setAdding({ kind: "update" });
    try {
      window.sessionStorage.setItem(BOARD_SCROLL_KEY, String(window.scrollY));
    } catch {
      // No storage: the board simply starts at the top afterwards.
    }
    if (box === "extra") return router.push("/extra-jobs/new?from=board");
    // New accepted: the office form makes the account, starts its 8 steps and pins it.
    if (box === "account") return router.push("/accounts/new-accepted?from=board");
    if ((NOTE_BOXES as readonly string[]).includes(box)) setAdding({ kind: "note", box, boxName: SHARED_SQUARES.find((entry) => entry.kind === box)?.label ?? "this box" });
  };

  const printNotes = (query: string) => window.open(`/board/print?${query}`, "_blank", "noopener");

  const finish = async (paper: Paper, on: boolean) => {
    const ok = await act({ action: "done", kind: paper.kind, itemId: paper.itemId, on }, on ? "Unpinned. It is in the Done tray." : "Pinned back on the board.");
    if (ok && on) setOpenKey("");
  };

  return (
    <Screen
      title="Pin Board"
      addAction={
        state !== "loading" && state !== "off" && state !== "failed" && data ? (
          <>
            <AddButton href="/accounts/new-accepted?from=board">New accepted account</AddButton>
            <AddButton onClick={() => setPinning(true)}>Pin something</AddButton>
            {/* The real Extra Jobs form. The job pins itself here once it is saved. */}
            <AddButton href="/extra-jobs/new?from=board">Extra job</AddButton>
          </>
        ) : undefined
      }
    >
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
          <BigButton className={styles.tvButton} onClick={() => changeTab("tv")}>
            📺 TV Mode (Full Screen)
          </BigButton>

          {data.me.isOwner ? (
            <div className={styles.actions}>
              <BigButton kind="second" onClick={() => setTvOpen(true)}>
                Show on TV
              </BigButton>
            </div>
          ) : null}

          {tab === "board" ? (
            <>
              <BoardCanvas papers={papers} managers={data.managers} settings={data.settings} mySquare={data.me.squareId} onOpen={openPaper} onMove={move} onAdd={addTo} />
              <p className="ui-muted">Tap empty space in a box to add something there. Tap a note to open it. Drag it into a square to hand it off (on a phone, hold it first).</p>
              <Tips id="board-add" steps={[{ target: "[data-square]", text: "Tap empty space in a box to add something there." }]} />
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
            <div className={`${styles.bigCard} ${styles[open.kind]} ${open.label === "Account update" ? styles.updateNote : ""}`} data-big-card>
              <p className={styles.bigType}>
                {paperLabel(open)}
                {open.badge ? `, ${open.badge}` : ""}
              </p>
              <h2 className={styles.bigTitle}>
                {open.accountName && open.accountName === open.title ? <AccountLink accountId={open.accountId} name={open.accountName} /> : open.title || KIND_LABEL[open.kind]}
              </h2>
              <dl className={styles.bigFacts}>
                {open.accountName && open.accountName !== open.title ? (
                  <>
                    <dt>Account</dt>
                    <dd>
                      <AccountLink accountId={open.accountId} name={open.accountName} />
                    </dd>
                  </>
                ) : null}
                <dt>Who</dt>
                <dd>{open.forWho || data.managers.find((manager) => manager.id === open.square)?.name || "Office"}</dd>
                {open.dueDate ? (
                  <>
                    <dt>Due</dt>
                    <dd>
                      {dueLabel(open.dueDate)}
                      {isOverdue(open) ? " (overdue)" : ""}
                    </dd>
                  </>
                ) : null}
                {open.detail ? (
                  <>
                    <dt>Details</dt>
                    <dd>{open.detail}</dd>
                  </>
                ) : null}
                {open.progress ? (
                  <>
                    <dt>Checklist</dt>
                    <dd>
                      {open.progress.done} of {open.progress.total} done
                    </dd>
                  </>
                ) : null}
                <dt>Last update</dt>
                <dd>
                  {open.recordDone ? "Done. It comes down tomorrow." : open.takenAt ? `${open.takenBy} took it ${friendlyDate(open.takenAt)}.` : `Pinned ${friendlyDate(open.pinnedAt)}${open.pinnedBy ? ` by ${open.pinnedBy}` : ""}.`}
                  {isOld(open, data.settings) ? ` On the board ${daysLabel(daysPinned(open))}.` : ""}
                </dd>
              </dl>
            </div>

            {/* An extra job: Done ✓ opens the job's page at its Done section (after photo, note, Done). The paper comes down by itself. */}
            {isExtraJob(open) && !open.recordDone && open.href ? (
              <BigButton className={styles.jobDoneButton} icon="check" disabled={busy} onClick={() => openDetails(open, "#done")} data-extra-job-done>
                Done ✓
              </BigButton>
            ) : null}

            {/* The status check: one tap, an optional note, and the history. */}
            {data.statusOn ? (
              <PinStatusBox
                key={`${open.kind}:${open.itemId}`}
                paper={open}
                canFinish={!isExtraJob(open)}
                onSaved={(takenDown) => {
                  if (takenDown) setOpenKey("");
                  void load();
                }}
              />
            ) : null}

            {/* A new account: the gold "Ready to start", and the button to its setup wizard ("Setup · X of Y done"). */}
            {open.kind === "account" ? (
              <>
                {open.setup?.ready ? <ReadyBadge size="panel" /> : null}
                <SetupButton
                  key={open.accountId || open.itemId}
                  accountId={open.accountId || open.itemId}
                  onOpen={() => {
                    setSetupFor({ accountId: open.accountId || open.itemId, accountName: open.accountName || open.title, paperKey: `${open.kind}:${open.itemId}` });
                    setOpenKey("");
                  }}
                />
              </>
            ) : null}

            {/* A new account in the 8-step flow: where it is, who has it, and why it is stuck. */}
            {open.flow ? (
              <>
                <p className="ui-strong">{setupStepsText(open.flow)}</p>
                <PizzaTracker view={open.flow} size="list" />
                {open.flow.step !== "live" ? <StuckNote accountId={open.accountId || open.itemId} view={open.flow} onSaved={() => void load()} /> : null}
              </>
            ) : null}

            <div className={styles.sheetButtons}>
              {open.href ? <BigButton onClick={() => openDetails(open)}>{open.href.startsWith("/supply-orders/print") ? "📄 Open order" : "Open full details"}</BigButton> : null}
              {/* A pinned account: the Print PDF file, made fresh when tapped (new tab, so the board stays open). */}
              {open.pdfHref ? (
                <a className="ui-btn ui-btn-second" href={open.pdfHref} target="_blank" rel="noopener">
                  <span>📄 Open PDF</span>
                </a>
              ) : null}
              <BigButton kind="second" onClick={() => printNotes(`note=${encodeURIComponent(`${open.kind}:${open.itemId}`)}`)}>
                Print
              </BigButton>
              {isExtraJob(open) ? null : (
                <BigButton kind="second" disabled={busy} onClick={() => void finish(open, true)}>
                  Unpin
                </BigButton>
              )}
              {open.takenAt ? (
                <BigButton kind="second" disabled={busy} onClick={() => void take(open, false)}>
                  Give it back
                </BigButton>
              ) : (
                <BigButton kind={open.href ? "second" : "main"} disabled={busy} onClick={() => void take(open, true)}>
                  Got it
                </BigButton>
              )}
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
              {open.square ? (
                <BigButton kind="quiet" disabled={busy} onClick={() => move(open, "")}>
                  {open.kind === "note" ? "Office" : "Shared square"}
                </BigButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* The Done tray: who unpinned what, and when. */}
      <Sheet
        open={trayOpen}
        title="Done tray"
        text={`Finished in the last ${data?.settings.doneDays ?? 7} days, newest first. Older ones are in the Archive.`}
        onClose={() => setTrayOpen(false)}
        closeLabel="Close"
        busy={busy}
      >
        <BigButton kind="second" href="/board/archive">
          Open the Archive
        </BigButton>
        {data && data.done.length === 0 ? <p className="ui-muted">Nothing was finished in these days.</p> : null}
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

      {data?.me.isOwner ? <ShowOnTvSheet open={tvOpen} startCode={tvCode} onClose={() => setTvOpen(false)} /> : null}
      {data && !data.me.isOwner && tvOpen ? (
        <Sheet open title="Show on TV" onClose={() => setTvOpen(false)} closeLabel="Close">
          <p>Only the owner can connect a TV. Ask the owner to scan the code on the TV.</p>
        </Sheet>
      ) : null}
      {data ? <AddToBoxSheet target={adding} me={data.me.name} onClose={() => setAdding(null)} onAdded={() => void load()} /> : null}
      {data ? <PinSheet open={pinning} data={data} defaultSquare={data.me.squareId} onClose={() => setPinning(false)} onPinned={() => void load()} /> : null}
      {setupFor ? (
        <OnboardingWizardModal
          accountId={setupFor.accountId}
          accountName={setupFor.accountName}
          onClose={() => {
            // Back to the pin's panel, with its tracker, count and badge read again.
            setOpenKey(setupFor.paperKey);
            setSetupFor(null);
            void load();
          }}
        />
      ) : null}
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
      {whose && papers.length > 0 ? (
        <div>
          <BigButton kind="second" onClick={() => window.open(`/board/print?square=${encodeURIComponent(whose)}`, "_blank", "noopener")}>
            Print my square
          </BigButton>
        </div>
      ) : null}
      {whose && papers.length === 0 ? <EmptyState title="Nothing pinned here" text="When someone hands off a paper, it shows up here." icon="check" /> : null}
      {papers.map((paper) => {
        const days = daysPinned(paper);
        return (
          <article key={`${paper.kind}:${paper.itemId}`} className={`${styles.mineCard} ${styles[paper.kind]}`}>
            <div className="ui-actions-row">
              <span className={styles.mineTag}>
                {paperLabel(paper)}
                {paper.badge ? `, ${paper.badge}` : ""}
              </span>
              {isOld(paper, data.settings) ? <span className={styles.mineTagOld}>{daysLabel(days)}</span> : <span className="ui-muted">{days === 0 ? "Today" : daysLabel(days)}</span>}
              {paper.statusNeeded ? <span className={styles.statusTagInline}>Status needed</span> : null}
            </div>
            {paper.status ? <p className={styles.statusLine}>{statusLine(paper.status)}</p> : null}
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
              {isExtraJob(paper) ? null : (
                <BigButton kind="second" icon="check" disabled={busy} onClick={() => onDone(paper)}>
                  Done
                </BigButton>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---------- "+ Pin something": a to-do in someone's square ---------- */

function PinSheet({ open, data, defaultSquare, onClose, onPinned }: { open: boolean; data: BoardData; defaultSquare: string; onClose: () => void; onPinned: () => void }) {
  const [text, setText] = useState("");
  const [square, setSquare] = useState(defaultSquare);
  // Optional: the account the paper is about (saved by its ID, so the paper links to the account page).
  const [account, setAccount] = useState<PickedAccount | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Each opening starts fresh.
  useEffect(() => {
    if (!open) return;
    setText("");
    setSquare(defaultSquare);
    setAccount(null);
    setAccountQuery("");
    setError("");
  }, [open, defaultSquare]);

  async function save() {
    setError("");
    if (!text.trim()) return setError("Write what needs doing.");
    if (!square) return setError("Pick whose square it goes in.");
    // Words typed in Account and not picked would be lost: ask to pick or clear.
    if (!account && accountQuery.trim()) return setError("Pick the account from the list, or clear the Account box.");
    setSaving(true);
    try {
      await postBoard({ action: "pin", kind: "note", text, square, accountId: account?.id ?? "", accountName: account?.name ?? "" });
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
      open={open}
      title="Pin something"
      onClose={onClose}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Pinning…" onClick={() => void save()}>
          Pin it
        </BigButton>
      }
    >
      <div className="ui-stack">
        <TextAreaField label="What needs doing?" rows={3} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} />
        {open ? <AccountPickerField label="Account (optional)" value={account} onChange={setAccount} onQueryChange={setAccountQuery} /> : null}
        <SelectField label="Whose square" value={square} onChange={(event) => setSquare(event.target.value)}>
          <option value="">Pick a manager</option>
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

/**
 * "Show on TV": the owner types the 6 numbers the TV is showing (or arrives
 * here from the TV's QR code with them filled in) and names the TV. The TV
 * switches to the board by itself. "Copy TV link" is the backup for a TV
 * whose browser can paste a link.
 */
function ShowOnTvSheet({ open, startCode, onClose }: { open: boolean; startCode: string; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("Office TV");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  // Each opening starts fresh.
  useEffect(() => {
    if (!open) return;
    setCode(startCode);
    setError("");
    setLink("");
  }, [open, startCode]);

  async function connect() {
    setError("");
    if (code.length !== 6) return setError("Type the 6 numbers showing on the TV.");
    setBusy(true);
    try {
      await postBoard({ action: "connectTv", code, label: name });
      showToast("Connected ✓ The TV is switching to the board.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not connect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setError("");
    setBusy(true);
    try {
      const data = await postBoard({ action: "createTvLink", label: name });
      const made = `${window.location.origin}/board/tv?k=${encodeURIComponent(String(data.token ?? ""))}`;
      setLink(made);
      try {
        await navigator.clipboard.writeText(made);
        showToast("TV link copied. Paste it in the TV's browser.");
      } catch {
        showToast("Copy did not work. Select the link below and copy it.", "bad");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The link was not made. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="Show on TV"
      text="On the TV, open cleaning-crm-xi.vercel.app/tv. It shows 6 numbers."
      onClose={onClose}
      busy={busy}
      actions={
        <BigButton busy={busy} busyLabel="Connecting…" onClick={() => void connect()}>
          Connect TV
        </BigButton>
      }
    >
      <div className="ui-stack">
        <Field label="The 6 numbers on the TV" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Field label="Name for this TV" hint="So you know which TV is which in Settings, Team." maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
        {error ? <p className="ui-field-error">{error}</p> : null}
        <p className="ui-muted">The TV only shows the board. Nothing can be changed from it, and it never shows money.</p>
        <div>
          <BigButton kind="second" disabled={busy} onClick={() => void copyLink()}>
            Copy TV link
          </BigButton>
        </div>
        <p className="ui-muted">Backup: for a TV with a browser where you can paste. Each tap makes a new link.</p>
        {link ? (
          <p className="ui-code" style={{ overflowWrap: "anywhere" }}>
            {link}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
