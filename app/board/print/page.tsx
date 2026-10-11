"use client";

// Printing from the Pin Board. Staff only (proxy.ts default gate; this is not
// under /board/tv, so a TV can never reach it).
//
//   /board/print?note=<kind>:<itemId>   one note on one page, big and readable
//   /board/print?square=<Staff ID>      every note in that square, on one page
//
// The print window opens by itself once the notes and their QR codes are ready.

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { BigButton, EmptyState, ErrorBox, MOTTO, Screen, SkeletonList } from "@/app/ui";
import { KIND_LABEL, dueLabel, isOverdue, paperLabel, papersIn, type BoardData, type Paper } from "@/lib/board";
import styles from "./print.module.css";

type Printable = { paper: Paper; who: string; address: string; link: string; qr: string };

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export default function BoardPrintPage() {
  const [state, setState] = useState<"loading" | "failed" | "empty" | "ready">("loading");
  const [notes, setNotes] = useState<Printable[]>([]);
  const [heading, setHeading] = useState("");
  const [one, setOne] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const noteKey = query.get("note") ?? "";
        const square = query.get("square") ?? "";
        const response = await fetch("/api/board", { cache: "no-store" });
        const data = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<BoardData>;
        if (!response.ok || data.success !== true || data.ready !== true) throw new Error("failed");
        const papers = data.papers ?? [];
        const managers = data.managers ?? [];
        const picked = noteKey ? papers.filter((paper) => `${paper.kind}:${paper.itemId}` === noteKey) : square ? papersIn(papers, { manager: square }) : [];
        if (!alive) return;
        if (picked.length === 0) return setState("empty");

        // The address is on the account, not on the note. If the list does not load, the note prints without it.
        const addresses = new Map<string, string>();
        if (picked.some((paper) => paper.accountId || paper.accountName)) {
          try {
            const list = (await (await fetch("/api/accounts", { cache: "no-store" })).json()) as { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
            for (const row of list.accounts ?? list.data ?? []) {
              const address = pick(row, ["address", "Address"]) || [pick(row, ["city", "City"]), pick(row, ["state", "State"]), pick(row, ["zip", "Zip"])].filter(Boolean).join(", ");
              if (!address) continue;
              const id = pick(row, ["accountId", "id", "Account ID"]);
              const name = pick(row, ["accountName", "Account Name"]).toLowerCase();
              if (id) addresses.set(`id:${id}`, address);
              if (name) addresses.set(`name:${name}`, address);
            }
          } catch {
            // Printed without addresses.
          }
        }

        const made = await Promise.all(
          picked.map(async (paper) => {
            // The QR opens the item itself; a plain sticky note opens the board.
            const link = `${window.location.origin}${paper.href || "/board"}`;
            return {
              paper,
              who: paper.forWho || managers.find((manager) => manager.id === paper.square)?.name || "Office",
              address: addresses.get(`id:${paper.accountId}`) ?? addresses.get(`name:${paper.accountName.toLowerCase()}`) ?? "",
              link,
              qr: await QRCode.toDataURL(link, { margin: 1, width: 320 }).catch(() => ""),
            };
          })
        );
        if (!alive) return;
        setOne(Boolean(noteKey));
        setHeading(noteKey ? "" : `${managers.find((manager) => manager.id === square)?.name ?? "Square"}: ${made.length} note${made.length === 1 ? "" : "s"}`);
        setNotes(made);
        setState("ready");
      } catch {
        if (alive) setState("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Once it is drawn, the print window opens by itself.
  useEffect(() => {
    if (state !== "ready") return;
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <Screen title="Print" backHref="/board">
      {state === "loading" ? (
        <SkeletonList rows={2} />
      ) : state === "failed" ? (
        <ErrorBox title="The notes did not load." text="Go back to the board and tap Print again." />
      ) : state === "empty" ? (
        <EmptyState title="Nothing to print" text="That note is not on the board any more." />
      ) : (
        <>
          <div className="no-print">
            <BigButton onClick={() => window.print()}>Print</BigButton>
          </div>
          <div className={`ui-print-view ${styles.sheet} ${one ? styles.one : styles.many}`} data-print-sheet={one ? "one" : "many"}>
            {heading ? <h1 className={styles.heading}>{heading}</h1> : null}
            <div className={styles.grid}>
              {notes.map(({ paper, who, address, qr }) => (
                <article key={`${paper.kind}:${paper.itemId}`} className={styles.note} data-print-note>
                  <div className={styles.text}>
                    <p className={styles.type}>
                      {paperLabel(paper)}
                      {paper.badge ? `, ${paper.badge}` : ""}
                    </p>
                    <h2 className={styles.title}>{paper.title || KIND_LABEL[paper.kind]}</h2>
                    <dl className={styles.facts}>
                      {paper.accountName ? (
                        <>
                          <dt>Account</dt>
                          <dd>
                            {paper.accountName}
                            {address ? <span className={styles.address}>{address}</span> : null}
                          </dd>
                        </>
                      ) : null}
                      <dt>For</dt>
                      <dd>{who}</dd>
                      {paper.dueDate ? (
                        <>
                          <dt>Due</dt>
                          <dd>
                            {dueLabel(paper.dueDate)}
                            {isOverdue(paper) ? " (overdue)" : ""}
                          </dd>
                        </>
                      ) : null}
                      {paper.detail ? (
                        <>
                          <dt>Details</dt>
                          <dd>{paper.detail}</dd>
                        </>
                      ) : null}
                    </dl>
                  </div>
                  {qr ? (
                    <div className={styles.qrBox}>
                      {/* A generated picture of the item's link; nothing to optimize. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr} alt="QR code that opens this item in the app" className={styles.qr} />
                      <p className={styles.qrText}>Scan to open it in the app</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            <p className={styles.motto}>{MOTTO.en}</p>
          </div>
        </>
      )}
    </Screen>
  );
}
