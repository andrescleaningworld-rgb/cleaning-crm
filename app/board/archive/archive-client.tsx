"use client";

// The Archive: every finished paper that has left the Done tray, newest
// first. Search by account (or the words on the paper), or pick the day it
// was finished. "Put back on the board" pins it again where it was.

import { useCallback, useEffect, useRef, useState } from "react";
import { BigButton, EmptyState, ErrorBox, Field, Screen, SearchBar, SkeletonList, friendlyDate, showToast } from "@/app/ui";
import { KIND_LABEL, type Paper } from "@/lib/board";
import { postBoard } from "../board-client";
import AccountLink from "../../components/AccountLink";
import styles from "../board.module.css";

type State = "loading" | "off" | "failed" | "ready";
const keyOf = (paper: Paper) => `${paper.kind}:${paper.itemId}`;

export default function ArchiveClient() {
  const [state, setState] = useState<State>("loading");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [more, setMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [doneDays, setDoneDays] = useState(7);
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  // Only the newest search's answer is shown.
  const asked = useRef(0);

  const load = useCallback(async (q: string, d: string, offset: number) => {
    const turn = ++asked.current;
    try {
      const response = await fetch(`/api/board?view=archive&q=${encodeURIComponent(q)}&day=${encodeURIComponent(d)}&offset=${offset}`, { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean; papers?: Paper[]; more?: boolean; total?: number; doneDays?: number };
      if (turn !== asked.current) return;
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      setPapers((current) => (offset > 0 ? [...current, ...(body.papers ?? [])] : (body.papers ?? [])));
      setMore(body.more === true);
      setTotal(body.total ?? 0);
      setDoneDays(body.doneDays ?? 7);
      setState("ready");
    } catch {
      if (turn === asked.current) setState("failed");
    }
  }, []);

  // The list follows the search box and the date, a moment after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(search.trim(), day, 0), 300);
    return () => window.clearTimeout(timer);
  }, [search, day, load]);

  async function putBack(paper: Paper) {
    setBusy(keyOf(paper));
    try {
      await postBoard({ action: "done", kind: paper.kind, itemId: paper.itemId, on: false });
      setPapers((current) => current.filter((item) => keyOf(item) !== keyOf(paper)));
      setTotal((count) => Math.max(0, count - 1));
      showToast("It is back on the board.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy("");
    }
  }

  const filtered = search.trim() !== "" || day !== "";

  return (
    <Screen title="Archive" subtitle={`Finished papers, after their ${doneDays} days in the Done tray. Nothing is deleted.`} backHref="/board">
      {state === "off" ? (
        <EmptyState title="Not turned on here yet" text="The Pin Board works once it is switched on and this database has its tables." />
      ) : (
        <>
          <SearchBar value={search} onChange={setSearch} label="Find an account" placeholder="Find an account" />
          <Field label="Finished on" optional type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          {filtered ? (
            <div>
              <BigButton
                kind="quiet"
                onClick={() => {
                  setSearch("");
                  setDay("");
                }}
              >
                Show everything
              </BigButton>
            </div>
          ) : null}

          {state === "loading" ? (
            <SkeletonList rows={3} />
          ) : state === "failed" ? (
            <ErrorBox title="The Archive did not load." onRetry={() => void load(search.trim(), day, 0)} />
          ) : papers.length === 0 ? (
            <EmptyState
              icon="check"
              title={filtered ? "Nothing matches" : "The Archive is empty"}
              text={filtered ? "Try another account name or another day." : `A finished paper comes here after ${doneDays} days in the Done tray.`}
            />
          ) : (
            <>
              <p className="ui-muted" role="status">
                Showing {papers.length} of {total} archived paper{total === 1 ? "" : "s"}
              </p>
              <div data-archive-list>
                {papers.map((paper) => (
                  <div key={keyOf(paper)} className={styles.trayRow}>
                    <div>
                      <p className="ui-strong">
                        {paper.accountName ? <AccountLink accountId={paper.accountId} name={paper.accountName} /> : paper.title || KIND_LABEL[paper.kind]}
                      </p>
                      <p className="ui-muted">
                        {KIND_LABEL[paper.kind]}
                        {paper.title && paper.title !== paper.accountName ? `: ${paper.title}` : ""}. Done {friendlyDate(paper.doneAt)}
                        {paper.doneBy ? ` by ${paper.doneBy}` : ""}.
                      </p>
                    </div>
                    <BigButton kind="second" busy={busy === keyOf(paper)} busyLabel="Pinning…" disabled={busy !== ""} onClick={() => void putBack(paper)}>
                      Put back on the board
                    </BigButton>
                  </div>
                ))}
              </div>
              {more ? (
                <BigButton
                  kind="second"
                  busy={loadingMore}
                  busyLabel="Loading…"
                  onClick={() => {
                    setLoadingMore(true);
                    void load(search.trim(), day, papers.length).finally(() => setLoadingMore(false));
                  }}
                >
                  Show older ones
                </BigButton>
              ) : null}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
