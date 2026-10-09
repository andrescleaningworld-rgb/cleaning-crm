"use client";

// The cork board itself: the four shared squares, one square per manager and
// the papers pinned in them. Used by /board (tap a paper, drag it into a
// square) and by /board/tv (`tv`: bigger, nothing to tap, only the account
// name and the kind of paper).

import { Caveat } from "next/font/google";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { KIND_LABEL, SHARED_SQUARES, daysLabel, daysPinned, isOld, paperTilt, papersIn, type BoardManager, type BoardSettings, type Paper } from "@/lib/board";
import styles from "./board.module.css";

const handwriting = Caveat({ subsets: ["latin"], weight: ["700"], display: "swap" });

const paperKey = (paper: Pick<Paper, "kind" | "itemId">) => `${paper.kind}:${paper.itemId}`;

/** The papers one square would take: a manager's square takes anything, a shared square only its own kind. */
function canDrop(paper: Paper, square: string): boolean {
  if (square.startsWith("mgr:")) return paper.square !== square.slice(4);
  return paper.kind !== "note" && square === `shared:${paper.kind}` && paper.square !== "";
}

export function PaperFace({ paper, settings, tv = false, now }: { paper: Paper; settings: BoardSettings; tv?: boolean; now: Date }) {
  const days = daysPinned(paper, now);
  const old = isOld(paper, settings, now);
  const taken = Boolean(paper.takenAt);
  // TV mode: the account name and the kind of paper, nothing else.
  const title = tv ? paper.accountName : paper.title;
  return (
    <>
      <span className={`${styles.pin} ${taken ? styles.pinGreen : styles.pinRed}`} aria-hidden="true" />
      {old ? <span className={styles.daysTag}>{daysLabel(days)}</span> : null}
      <span className={styles.kind}>{KIND_LABEL[paper.kind]}</span>
      {title ? <span className={`${styles.title} ${paper.kind === "note" && !tv ? handwriting.className : ""}`}>{title}</span> : null}
      {!tv && paper.badge ? <span className={styles.badge}>{paper.badge}</span> : null}
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
      {!tv && taken ? <span className={styles.who}>Got it: {paper.takenBy}</span> : null}
      <span className="ui-visually-hidden">{taken ? "Someone has it." : "Nobody has taken it yet."}</span>
    </>
  );
}

export function paperClass(paper: Paper, settings: BoardSettings, now: Date): string {
  return `${styles.paper} ${styles[paper.kind]} ${isOld(paper, settings, now) ? styles.old : ""}`;
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
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
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
    const face = <PaperFace paper={paper} settings={settings} tv={tv} now={now} />;
    if (tv || !onOpen) {
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

  function renderSquare(key: string, name: string, list: Paper[], mine = false) {
    return (
      <section key={key} data-square={key} className={`${styles.square} ${drag?.over === key ? styles.squareOver : ""} ${mine ? styles.squareMine : ""}`} aria-label={name}>
        <div className={styles.squareHead}>
          <h2 className={styles.squareName}>{name}</h2>
          <span className={styles.squareCount}>{list.length}</span>
        </div>
        {list.length === 0 ? <p className={styles.emptySquare}>Nothing pinned</p> : <div className={styles.papers}>{list.map(renderPaper)}</div>}
      </section>
    );
  }

  return (
    <div className={`${styles.frame} ${tv ? styles.tv : ""}`}>
      <div className={styles.cork}>
        <div className={styles.row}>
          {SHARED_SQUARES.map((square) => renderSquare(`shared:${square.kind}`, square.label, papersIn(papers, { shared: square.kind })))}
          {/* Only when a to-do lost its square (its manager is no longer on the board), so it is never out of sight. */}
          {papersIn(papers, { shared: "note" }).length > 0 ? renderSquare("shared:note", "To-dos", papersIn(papers, { shared: "note" })) : null}
        </div>
        <div className={styles.row}>
          {managers.map((manager) => renderSquare(`mgr:${manager.id}`, manager.name, papersIn(papers, { manager: manager.id }), manager.id === mySquare))}
        </div>
      </div>
      {drag ? (
        <div className={`${paperClass(drag.paper, settings, now)} ${styles.ghost}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <PaperFace paper={drag.paper} settings={settings} now={now} />
        </div>
      ) : null}
    </div>
  );
}
