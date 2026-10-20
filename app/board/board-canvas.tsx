"use client";

// The cork board itself: the four shared squares, one square per manager and
// the papers pinned in them. Used by /board (tap a paper, drag it into a
// square) and by /board/tv (`tv`: bigger, nothing to tap, only the account
// name and the kind of paper).

import { Caveat } from "next/font/google";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Sheet } from "@/app/ui";
import { SHARED_SQUARES, flowStepLine, paperLabel, daysLabel, daysPinned, dueLabel, isOld, isOverdue, paperTilt, papersIn, type BoardManager, type BoardSettings, type Paper } from "@/lib/board";
import PizzaTracker from "@/app/components/pizza-tracker";
import styles from "./board.module.css";

const handwriting = Caveat({ subsets: ["latin"], weight: ["700"], display: "swap" });

const paperKey = (paper: Pick<Paper, "kind" | "itemId">) => `${paper.kind}:${paper.itemId}`;

/** The papers one square would take: a manager's square takes anything, a shared square only its own kind. */
function canDrop(paper: Paper, square: string): boolean {
  if (square.startsWith("mgr:")) return paper.square !== square.slice(4);
  // The Office square takes to-dos and pinned records back from a manager's square.
  if (square === "shared:note") return paper.kind === "note" && paper.square !== "";
  return paper.kind !== "note" && square === `shared:${paper.kind}` && paper.square !== "";
}

export function PaperFace({ paper, settings, tv = false, now, handedTo = "" }: { paper: Paper; settings: BoardSettings; tv?: boolean; now: Date; handedTo?: string }) {
  const days = daysPinned(paper, now);
  const old = isOld(paper, settings, now);
  const taken = Boolean(paper.takenAt);
  // TV mode: the account name and the kind of paper, nothing else.
  const title = tv ? paper.accountName : paper.title;
  return (
    <>
      <span className={`${styles.pin} ${taken ? styles.pinGreen : styles.pinRed}`} aria-hidden="true" />
      {old ? <span className={styles.daysTag}>{daysLabel(days)}</span> : null}
      <span className={styles.kind}>{paperLabel(paper)}</span>
      {title ? <span className={`${styles.title} ${paper.kind === "note" && !tv ? handwriting.className : ""}`}>{title}</span> : null}
      {!tv && paper.badge ? <span className={styles.badge}>{paper.badge}</span> : null}
      {/* Its copy in "New accepted" while a manager has it: who has it and the step it is on. */}
      {paper.mirror ? (
        <>
          <span className={styles.badge}>Handed to {handedTo || "a manager"}</span>
          <span className={styles.meta}>{flowStepLine(paper)}</span>
        </>
      ) : null}
      {/* A new account in the 8-step flow: its pizza tracker, on the board and on the TV. */}
      {paper.flow ? <PizzaTracker view={paper.flow} size="pin" /> : null}
      {!tv && paper.flow?.stuckNote ? <span className={styles.meta}>Stuck: {paper.flow.stuckNote}</span> : null}
      {!tv && paper.progress ? (
        <>
          <span className={styles.bar} aria-hidden="true">
            <span className={styles.barFill} style={{ width: `${paper.progress.total ? Math.round((paper.progress.done / paper.progress.total) * 100) : 0}%` }} />
          </span>
          <span className={styles.barText}>
            {paper.progress.done} of {paper.progress.total} done
          </span>
        </>
      ) : null}
      {!tv && (paper.forWho || paper.dueDate) ? (
        <span className={styles.meta}>
          {paper.forWho ? `For ${paper.forWho}` : ""}
          {paper.forWho && paper.dueDate ? " · " : ""}
          {paper.dueDate ? `Due ${dueLabel(paper.dueDate)}` : ""}
        </span>
      ) : null}
      {isOverdue(paper, now) ? (
        <span className={styles.overdueCorner} aria-hidden="true" />
      ) : null}
      {isOverdue(paper, now) ? <span className="ui-visually-hidden">Overdue.</span> : null}
      {paper.recordDone ? (
        <span className={styles.doneCheck}>
          ✓ <span className="ui-visually-hidden">Done. It comes down tomorrow.</span>
        </span>
      ) : null}
      {!tv && taken ? <span className={styles.who}>Got it: {paper.takenBy}</span> : null}
      <span className="ui-visually-hidden">{taken ? "Someone has it." : "Nobody has taken it yet."}</span>
    </>
  );
}

export function paperClass(paper: Paper, settings: BoardSettings, now: Date): string {
  // An account update is a green note; every other note is yellow.
  return `${styles.paper} ${styles[paper.kind]} ${paper.label === "Account update" ? styles.updateNote : ""} ${isOld(paper, settings, now) ? styles.old : ""} ${paper.flow?.red ? styles.flowRed : ""}`;
}

/* ---------- a full square: the papers that fit, then a pile ---------- */

// A paper is at least this wide, with this gap beside it (.paper and .papers in board.module.css).
const PAPER_WIDTH = 150;
const PAPER_GAP = 10;

/** How many papers fit in a square this wide: two rows of them, or four when only one fits across. */
function papersThatFit(width: number): number {
  const across = Math.max(1, Math.floor((width + PAPER_GAP) / (PAPER_WIDTH + PAPER_GAP)));
  return across >= 2 ? across * 2 : 4;
}

/** Late and stuck papers first, then the oldest: the ones that stay in sight when a square is full. */
function urgentFirst(list: Paper[], settings: BoardSettings, now: Date): Paper[] {
  const late = (paper: Paper) => (isOverdue(paper, now) || isOld(paper, settings, now) ? 0 : 1);
  return [...list].sort((a, b) => late(a) - late(b) || a.pinnedAt.localeCompare(b.pinnedAt));
}

/**
 * The papers of one square. When they all fit they hang as they always did.
 * When they do not, the most urgent ones hang and the rest are one pile.
 */
function SquarePapers({
  list,
  settings,
  now,
  renderPaper,
  renderPile,
}: {
  list: Paper[];
  settings: BoardSettings;
  now: Date;
  renderPaper: (paper: Paper) => ReactNode;
  renderPile: (hidden: number) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const next = box.current?.clientWidth ?? 0;
      setWidth((before) => (before === next ? before : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" || !box.current ? null : new ResizeObserver(measure);
    if (observer && box.current) observer.observe(box.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  // Until the square is measured, everything hangs.
  const fit = width > 0 ? papersThatFit(width) : list.length;
  if (list.length <= fit) {
    return (
      <div ref={box} className={styles.papers}>
        {list.map(renderPaper)}
      </div>
    );
  }
  // The pile takes one paper's place.
  const shown = urgentFirst(list, settings, now).slice(0, fit - 1);
  return (
    <div ref={box} className={styles.papers}>
      {shown.map(renderPaper)}
      {renderPile(list.length - shown.length)}
    </div>
  );
}

type Pending = { paper: Paper; x: number; y: number; touch: boolean; timer: number | null };
type Drag = { paper: Paper; x: number; y: number; over: string };

export default function BoardCanvas({
  papers,
  managers,
  settings,
  mySquare = "",
  tv = false,
  onOpen,
  onMove,
  onAdd,
}: {
  papers: Paper[];
  managers: BoardManager[];
  settings: BoardSettings;
  /** My own square gets a yellow border. */
  mySquare?: string;
  tv?: boolean;
  onOpen?: (paper: Paper) => void;
  /** A paper was dropped into a square: "" = its shared square, else a manager's Staff ID. */
  onMove?: (paper: Paper, square: string) => void;
  /** Empty space in a box was tapped: "shared:<kind>", "shared:note" (Office) or "mgr:<Staff ID>". Never in TV mode. */
  onAdd?: (square: string) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  // TV mode: the paper someone tapped, shown bigger. Nothing else happens on a tap there.
  const [zoomed, setZoomed] = useState<Paper | null>(null);
  // The square whose pile was tapped: all of its papers show in a sheet.
  const [pile, setPile] = useState<{ key: string; name: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const skipClickUntil = useRef(0);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  });

  // "X days" keeps counting on a board that is left open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Dragging. A mouse drags as soon as it moves; a finger has to hold the
  // paper for a moment first, so swiping over the board still scrolls.
  useEffect(() => {
    if (tv) return;
    const squareAt = (x: number, y: number, paper: Paper) => {
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-square]")?.dataset.square ?? "";
      return hit && canDrop(paper, hit) ? hit : "";
    };
    const start = (from: Pending) => {
      const next = { paper: from.paper, x: from.x, y: from.y, over: "" };
      pending.current = null;
      dragRef.current = next;
      setDrag(next);
    };
    const clear = () => {
      if (pending.current?.timer) window.clearTimeout(pending.current.timer);
      pending.current = null;
      dragRef.current = null;
      setDrag(null);
    };
    const move = (event: PointerEvent) => {
      const waiting = pending.current;
      if (waiting && !dragRef.current) {
        const far = Math.hypot(event.clientX - waiting.x, event.clientY - waiting.y) > 8;
        if (far && waiting.touch) clear();
        else if (far) start({ ...waiting, x: event.clientX, y: event.clientY });
        else {
          waiting.x = event.clientX;
          waiting.y = event.clientY;
        }
        return;
      }
      const current = dragRef.current;
      if (!current) return;
      const next = { ...current, x: event.clientX, y: event.clientY, over: squareAt(event.clientX, event.clientY, current.paper) };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      if (current) {
        skipClickUntil.current = Date.now() + 400;
        const target = squareAt(event.clientX, event.clientY, current.paper);
        if (target) onMoveRef.current?.(current.paper, target.startsWith("mgr:") ? target.slice(4) : "");
      }
      clear();
    };
    const touchMove = (event: TouchEvent) => {
      if (dragRef.current) event.preventDefault();
    };
    // The long press is started by onPointerDown below; this lets it begin the drag.
    const begin = (event: Event) => {
      const waiting = pending.current;
      if (waiting && (event as CustomEvent<string>).detail === paperKey(waiting.paper)) start(waiting);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("cw:board-hold", begin);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("cw:board-hold", begin);
      clear();
    };
  }, [tv]);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>, paper: Paper) {
    if (!onMove || event.button !== 0) return;
    const touch = event.pointerType !== "mouse";
    const key = paperKey(paper);
    pending.current = {
      paper,
      x: event.clientX,
      y: event.clientY,
      touch,
      timer: touch ? window.setTimeout(() => window.dispatchEvent(new CustomEvent("cw:board-hold", { detail: key })), 350) : null,
    };
  }

  function renderPaper(paper: Paper) {
    const key = paperKey(paper);
    const style = { transform: `rotate(${paperTilt(paper.itemId)}deg)` };
    const face = <PaperFace paper={paper} settings={settings} tv={tv} now={now} handedTo={paper.mirror ? managers.find((manager) => manager.id === paper.square)?.name : ""} />;
    if (tv) {
      return (
        <div key={key} className={paperClass(paper, settings, now)} style={style} role="button" tabIndex={0} onClick={() => setZoomed(paper)} onKeyDown={(event) => event.key === "Enter" && setZoomed(paper)}>
          {face}
        </div>
      );
    }
    if (!onOpen) {
      return (
        <div key={key} className={paperClass(paper, settings, now)} style={style}>
          {face}
        </div>
      );
    }
    return (
      <button
        key={key}
        type="button"
        className={`${paperClass(paper, settings, now)} ${drag && paperKey(drag.paper) === key ? styles.dragging : ""}`}
        style={style}
        data-paper
        onPointerDown={(event) => onPointerDown(event, paper)}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          if (Date.now() < skipClickUntil.current) return;
          onOpen(paper);
        }}
      >
        {face}
      </button>
    );
  }

  // The papers of a square, by its key: "shared:<kind>" or "mgr:<Staff ID>".
  const papersOf = (key: string) => (key.startsWith("mgr:") ? papersIn(papers, { manager: key.slice(4) }) : papersIn(papers, { shared: key.slice(7) as Paper["kind"] }));

  // The pile at the bottom of a full square: paper edges peeking out, one pin, and how many are in it.
  function renderPile(key: string, name: string, hidden: number, total: number) {
    const face = (
      <>
        <span className={styles.pileSheet} aria-hidden="true" />
        <span className={styles.pileSheet} aria-hidden="true" />
        <span className={styles.pileSheet} aria-hidden="true" />
        <span className={`${styles.pin} ${styles.pinRed}`} aria-hidden="true" />
        <span className={styles.pileCount}>+{hidden}</span>
        <span className={styles.pileWord}>more</span>
      </>
    );
    if (tv || !onOpen) {
      return (
        <div key="pile" className={styles.pile} data-pile>
          {face}
        </div>
      );
    }
    return (
      <button
        key="pile"
        type="button"
        className={styles.pile}
        data-paper
        data-pile
        aria-label={`${hidden} more in ${name}. Show all ${total} papers.`}
        onClick={() => {
          if (Date.now() < skipClickUntil.current) return;
          setPile({ key, name });
        }}
      >
        {face}
      </button>
    );
  }

  function renderSquare(key: string, name: string, list: Paper[], mine = false) {
    const canAdd = !tv && Boolean(onAdd);
    // A tap on a paper opens the paper; a tap anywhere else in the box adds something there.
    const tapEmpty = (event: ReactMouseEvent<HTMLElement>) => {
      if (!canAdd || Date.now() < skipClickUntil.current) return;
      if ((event.target as HTMLElement).closest("[data-paper]")) return;
      onAdd?.(key);
    };
    return (
      <section
        key={key}
        data-square={key}
        className={`${styles.square} ${canAdd ? styles.squareAdd : ""} ${drag?.over === key ? styles.squareOver : ""} ${mine ? styles.squareMine : ""}`}
        aria-label={name}
        onClick={canAdd ? tapEmpty : undefined}
      >
        <div className={styles.squareHead}>
          <h2 className={styles.squareName}>{name}</h2>
          <span className={styles.squareCount}>{list.length}</span>
        </div>
        {list.length === 0 ? <p className={styles.emptySquare}>{canAdd ? "Tap to add" : "Nothing pinned"}</p> : <SquarePapers list={list} settings={settings} now={now} renderPaper={renderPaper} renderPile={(hidden) => renderPile(key, name, hidden, list.length)} />}
        {/* Always some empty room at the bottom to tap, even in a full box. */}
        {canAdd ? (
          <button type="button" className={styles.addStrip} aria-label={`Add to ${name}`}>
            <span className="ui-visually-hidden">Add to {name}</span>
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className={`${styles.frame} ${tv ? styles.tv : ""}`}>
      {tv && zoomed ? (
        <div className={styles.zoom} role="dialog" aria-label="Paper, bigger" onClick={() => setZoomed(null)}>
          <div className={`${paperClass(zoomed, settings, now)} ${styles.zoomPaper}`}>
            <PaperFace paper={zoomed} settings={settings} tv now={now} />
          </div>
        </div>
      ) : null}
      <div className={styles.cork}>
        <div className={styles.row}>
          {SHARED_SQUARES.map((square) => renderSquare(`shared:${square.kind}`, square.label, papersIn(papers, { shared: square.kind })))}
          {/* The Office square: records pinned for the office ("Pin to board"), and a to-do whose manager is no longer on the board. Shown only when something is in it. */}
          {papersIn(papers, { shared: "note" }).length > 0 || (!tv && onAdd) ? renderSquare("shared:note", "Office", papersIn(papers, { shared: "note" })) : null}
        </div>
        <div className={styles.row}>
          {managers.map((manager) => renderSquare(`mgr:${manager.id}`, manager.name, papersIn(papers, { manager: manager.id }), manager.id === mySquare))}
        </div>
      </div>
      {/* Every paper of the square whose pile was tapped. A tap on one opens it like any paper. */}
      <Sheet open={pile !== null} title={pile ? `${pile.name}: ${papersOf(pile.key).length} papers` : ""} onClose={() => setPile(null)} closeLabel="Close">
        <div className={styles.pileList}>
          {pile
            ? urgentFirst(papersOf(pile.key), settings, now).map((paper) => (
                <button
                  key={paperKey(paper)}
                  type="button"
                  className={`${paperClass(paper, settings, now)} ${styles.pileItem}`}
                  onClick={() => {
                    setPile(null);
                    onOpen?.(paper);
                  }}
                >
                  <PaperFace paper={paper} settings={settings} now={now} />
                </button>
              ))
            : null}
        </div>
      </Sheet>
      {drag ? (
        <div className={`${paperClass(drag.paper, settings, now)} ${styles.ghost}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <PaperFace paper={drag.paper} settings={settings} now={now} />
        </div>
      ) : null}
    </div>
  );
}
