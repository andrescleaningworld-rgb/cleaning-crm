// Office TV mode of the Pin Board. No login (proxy.ts lists this path as
// public): the request must carry a TV link's token (?k=), or come from a
// logged-in staff member looking at TV mode from the board's tabs.
//
// What leaves here is cut down for a screen anyone in the office can see:
// the account name and the kind of paper, nothing else. No note text, no
// order details, no money, no addresses, no phone numbers, no record ids.
// The slideshow is the photos staff gave the "Show on TV" star, with the
// account name under each, mixed with the pictures copied from the office's
// Google Drive folder (no caption; lib/pg/tv-slideshow.ts); "today" is the day's birthdays, anniversaries,
// holidays and company events (first names and titles only).

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { isOld, type Paper } from "@/lib/board";
import { officeDay } from "@/lib/cleanings";
import { boardReady, getBoardSettings, listBoardManagers, listPapers, syncBoard, tvTokenIsValid } from "@/lib/pg/board";
import { listCleanings } from "@/lib/pg/cleanings";
import { flowsReady, syncAutoSteps } from "@/lib/pg/account-flow";
import { eventLine } from "@/lib/officeEvents";
import { listOfficeEvents, tvSlides, type TvSlide } from "@/lib/pg/office-events";
import { driveSlideUrls, getTvSlideshowSettings } from "@/lib/pg/tv-slideshow";

const noStore = { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } };

/**
 * Starred photos and Drive pictures shuffled together. The order is the same
 * all day (it only changes with the date), so the TV, which asks again every
 * minute, carries on through the pictures instead of starting over.
 */
function mixed(slides: TvSlide[], day: string): TvSlide[] {
  const rank = (slide: TvSlide) => createHash("sha256").update(`${day}|${slide.url}`).digest("hex");
  const ranked = slides.map((slide) => ({ slide, rank: rank(slide) }));
  ranked.sort((a, b) => a.rank.localeCompare(b.rank));
  return ranked.map((entry) => entry.slide);
}

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
    box: paper.box,
    pinnedBy: "",
    takenBy: "",
    // Only whether someone has it (green pin), not who.
    takenAt: paper.takenAt,
    doneAt: "",
    doneBy: "",
    progress: null,
    // A crew "Couldn't do" paper turned red.
    alert: paper.alert === true,
    // Only the gold "Ready to start", not the setup count.
    setup: paper.setup?.ready ? { done: 0, total: 0, ready: true } : null,
    // The pizza tracker and who the step is with ("with Greg"), as the office asked for the TV. The stuck note stays off the TV.
    flow: paper.flow ? { ...paper.flow, stuckNote: "", stuckNoteBy: "", stuckNoteAt: "" } : null,
    href: "",
    pdfHref: "",
    // "Status needed" and the latest status in a word, not who gave it or the note.
    status: paper.status ? { key: paper.status.key, note: "", by: "", at: "" } : null,
    statusNeeded: paper.statusNeeded,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!(await boardReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const token = request.nextUrl.searchParams.get("k") ?? "";
    const allowed = (token && (await tvTokenIsValid(token))) || Boolean(await getAdminIdentity(request));
    if (!allowed) return NextResponse.json({ success: false, error: "This TV link is off." }, { status: 401, ...noStore });

    await syncBoard();
    if (await flowsReady().catch(() => false)) await syncAutoSteps().catch((error) => console.error("[board tv] account flows:", error instanceof Error ? error.message : error));
    const today = officeDay();
    const settings = await getBoardSettings();
    const [managers, lists, calendar, starred, drive, slideshow, events] = await Promise.all([
      listBoardManagers(),
      listPapers(settings.doneDays),
      listCleanings(today, today),
      // Neither may stop the board: no photos and no days is a fine answer.
      tvSlides().catch(() => []),
      driveSlideUrls(),
      getTvSlideshowSettings().catch(() => null),
      listOfficeEvents(today, today).catch(() => []),
    ]);
    const slides = mixed([...starred, ...drive.map((url) => ({ url, caption: "" }))], today);
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
          stuck: papers.filter((paper) => isOld(paper, settings) || paper.flow?.red === true).length,
          doneToday: lists.done.filter((paper) => paper.doneAt && officeDay(paper.doneAt) === today).length,
        },
        cleanings: calendar.cleanings.map((cleaning) => ({ accountName: cleaning.accountName, sub: cleaning.sub, status: cleaning.status })),
        slides,
        // The slideshow starts after the board sits this long with no remote press, click or touch.
        idleMinutes: slideshow?.idleMinutes ?? 5,
        // How long each picture stays up, and how many slides one round shows.
        slideSeconds: slideshow?.slideSeconds ?? 10,
        slidesPerShow: slideshow?.slidesPerShow ?? 6,
        todayNotes: events.map((event) => ({ kind: event.kind, text: eventLine(event) })),
      },
      noStore
    );
  } catch (error) {
    console.error("[board tv GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The board did not load." }, { status: 500, ...noStore });
  }
}
