// Office TV mode of the Pin Board. No login (proxy.ts lists this path as
// public): the request must carry a TV link's token (?k=), or come from a
// logged-in staff member looking at TV mode from the board's tabs.
//
// What leaves here is cut down for a screen anyone in the office can see:
// the account name and the kind of paper, nothing else. No note text, no
// order details, no money, no addresses, no phone numbers, no record ids.

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { isOld, type Paper } from "@/lib/board";
import { officeDay } from "@/lib/cleanings";
import { boardReady, getBoardSettings, listBoardManagers, listPapers, syncBoard, tvTokenIsValid } from "@/lib/pg/board";
import { listCleanings } from "@/lib/pg/cleanings";

const noStore = { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } };

/** A stand-in for the record id: steady (so a paper keeps its tilt) but not the id itself. */
const shortId = (paper: Paper) => createHash("sha256").update(`${paper.kind}:${paper.itemId}`).digest("hex").slice(0, 12);

function forTv(paper: Paper): Paper {
  return {
    kind: paper.kind,
    itemId: shortId(paper),
    label: paper.label,
    title: "",
    accountId: "",
    accountName: paper.accountName,
    detail: "",
    badge: "",
    square: paper.square,
    pinnedAt: paper.pinnedAt,
    forWho: "",
    dueDate: paper.dueDate,
    recordDone: paper.recordDone,
    pinnedBy: "",
    takenBy: "",
    // Only whether someone has it (green pin), not who.
    takenAt: paper.takenAt,
    doneAt: "",
    doneBy: "",
    progress: null,
    href: "",
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!(await boardReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const token = request.nextUrl.searchParams.get("k") ?? "";
    const allowed = (token && (await tvTokenIsValid(token))) || Boolean(await getAdminIdentity(request));
    if (!allowed) return NextResponse.json({ success: false, error: "This TV link is off." }, { status: 401, ...noStore });

    await syncBoard();
    const today = officeDay();
    const [settings, managers, lists, calendar] = await Promise.all([getBoardSettings(), listBoardManagers(), listPapers(), listCleanings(today, today)]);
    const squares = new Set(managers.map((manager) => manager.id));
    const papers = lists.papers.map((paper) => (paper.square && !squares.has(paper.square) ? { ...paper, square: "" } : paper));
    return NextResponse.json(
      {
        success: true,
        ready: true,
        today,
        settings,
        managers,
        papers: papers.map(forTv),
        counters: {
          pinned: papers.length,
          stuck: papers.filter((paper) => isOld(paper, settings)).length,
          doneToday: lists.done.filter((paper) => paper.doneAt && officeDay(paper.doneAt) === today).length,
        },
        cleanings: calendar.cleanings.map((cleaning) => ({ accountName: cleaning.accountName, sub: cleaning.sub, status: cleaning.status })),
      },
      noStore
    );
  } catch (error) {
    console.error("[board tv GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The board did not load." }, { status: 500, ...noStore });
  }
}
