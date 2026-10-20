// Office Pin Board API (/board). Staff only (proxy.ts default gate).
// Postgres only; see lib/pg/board.ts. When the board is switched off or its
// tables are not in this database yet, GET answers { ready: false } and the
// page says so.

import { after, NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import type { BoardData, BoardMe } from "@/lib/board";
import { NOTE_BOXES } from "@/lib/board";
import { PIN_TYPES, isPinType, readPinTypes, type PinInfo, type PinType } from "@/lib/boardPins";
import { getPinTypes, listPinnedRecords, noteItemId, pinRecord, pinSettingsReady, savePinTypes, syncPinnedTodos, unpinRecord } from "@/lib/pg/board-pins";
import { notifyBoardSquare, paperOnBoard, toDoTextCoversSquare, type PaperNow } from "@/lib/pg/board-sms";
import { flowsReady, syncAutoSteps } from "@/lib/pg/account-flow";
import {
  boardReady,
  connectTv,
  createTvLink,
  finishPaper,
  getBoardSettings,
  isExtraJobPaper,
  listBoardManagers,
  listArchive,
  listPapers,
  listTvLinks,
  movePaper,
  pinPaper,
  revokeTvLink,
  saveBoardSettings,
  syncBoard,
  takePaper,
} from "@/lib/pg/board";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

// The paper a record has on the board now, to tell "pinned into this square"
// from "it was already there". A supply order's paper is not looked up (its
// ID is worked out in SQL), so it counts as new.
function recordPaper(type: PinType, recordId: string): Promise<PaperNow | null> {
  if (type === "complaint") return paperOnBoard("complaint", recordId);
  if (type === "supply") return Promise.resolve(null);
  return paperOnBoard("note", noteItemId(type, recordId));
}

export async function GET(request: NextRequest) {
  try {
    if (!(await boardReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const identity = await getAdminIdentity(request);
    const view = request.nextUrl.searchParams.get("view");

    // The account names for "+ Extra job" and "+ Pin something".
    if (view === "accounts") {
      const sql = getSql();
      const rows = (await sql`
        SELECT id, account_name FROM accounts
        WHERE id IS NOT NULL AND btrim(account_name) <> '' AND status_key <> 'cancelled' AND (to_jsonb(accounts)->>'deleted_at') IS NULL
        ORDER BY lower(account_name)
      `) as { id: string; account_name: string }[];
      return NextResponse.json({ success: true, accounts: rows.map((row) => ({ id: row.id, name: row.account_name.trim() })) }, noStore);
    }

    // What a record's own screen needs to offer "Pin to board": which types are switched on, the squares, and what is pinned now.
    if (view === "pin") {
      const [types, managers, pinned] = await Promise.all([getPinTypes(), listBoardManagers(), listPinnedRecords()]);
      const info: PinInfo = { types, managers, pinned };
      return NextResponse.json({ success: true, ready: true, ...info }, noStore);
    }

    // The Archive: finished papers that have left the Done tray. Search by account, or by the day it was finished.
    if (view === "archive") {
      if (!identity) return refuse("Log in first.", 401);
      const params = request.nextUrl.searchParams;
      const settings = await getBoardSettings();
      const list = await listArchive({ doneDays: settings.doneDays, search: params.get("q") ?? "", day: params.get("day") ?? "", offset: Number(params.get("offset") ?? 0) || 0 });
      return NextResponse.json({ success: true, ready: true, doneDays: settings.doneDays, ...list }, noStore);
    }

    // Settings -> Pin Board: the days setting and the TV links (owner only).
    if (view === "settings") {
      if (identity?.role !== "owner") return refuse("Only the owner can see the TV links.", 403);
      const [settings, links, pinTypes, pinReady] = await Promise.all([getBoardSettings(), listTvLinks(), getPinTypes(), pinSettingsReady()]);
      return NextResponse.json({ success: true, ready: true, settings, links, pinTypes, pinReady }, noStore);
    }

    await syncBoard();
    // New accounts in the 8-step flow: the Welcome Packet and the Onboarding Checklist finish steps 1 and 5 by themselves.
    if (await flowsReady().catch(() => false)) await syncAutoSteps().catch((error) => console.error("[board] account flows:", error instanceof Error ? error.message : error));
    // Pinned to-dos get their green check (and come down the day after) from the to-do itself.
    await syncPinnedTodos().catch((error) => console.error("[board] pinned to-dos:", error instanceof Error ? error.message : error));
    const settings = await getBoardSettings();
    const [managers, lists] = await Promise.all([listBoardManagers(), listPapers(settings.doneDays)]);
    const staffId = clean(identity?.staffId);
    const me: BoardMe = {
      name: clean(identity?.name),
      squareId: managers.some((manager) => manager.id === staffId) ? staffId : "",
      isOwner: identity?.role === "owner",
    };
    const data: BoardData = { settings, me, managers, papers: lists.papers, done: lists.done };
    return NextResponse.json({ success: true, ready: true, ...data }, noStore);
  } catch (error) {
    console.error("[board GET]", error instanceof Error ? error.message : error);
    return refuse("The board did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await boardReady())) return refuse("The Pin Board is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const kind = clean(body.kind);
    const itemId = clean(body.itemId);
    // For the text a manager gets when someone else puts a paper in their square (lib/pg/board-sms.ts).
    const byStaffId = clean(identity.staffId);
    const origin = new URL(request.url).origin;

    // "+ Pin something": a to-do. Extra jobs are not pinned by hand: they are set up on the Extra Jobs form and pin themselves.
    if (action === "pin") {
      if (kind === "extra") return refuse("Set the extra job up with the Extra job button. It pins itself.");
      const text = clean(body.text);
      const square = clean(body.square);
      // A sticky note added by tapping inside a shared box hangs in that box ("office" = the Office box).
      const box = clean(body.box);
      const inBox = box === "office" || (NOTE_BOXES as readonly string[]).includes(box);
      if (!text) return refuse("Write a few words first.");
      if (!square && !inBox) return refuse("Pick whose square it goes in.");
      if (square && !(await listBoardManagers()).some((manager) => manager.id === square)) return refuse("That person has no square on the board.");
      const id = await pinPaper({ text, accountId: clean(body.accountId), accountName: clean(body.accountName), square, by, notes: clean(body.notes), dueDate: clean(body.dueDate), box: square || box === "office" ? "" : box });
      if (square) {
        after(() => notifyBoardSquare({ square, byStaffId, paperId: id, title: text, accountName: clean(body.accountName), notes: clean(body.notes), origin, routeContext: "board/pin" }));
      }
      return NextResponse.json({ success: true, itemId: id });
    }

    if (action === "move") {
      const square = clean(body.square);
      if (!kind || !itemId) return refuse("kind and itemId are required.");
      if (square && !(await listBoardManagers()).some((manager) => manager.id === square)) return refuse("That person has no square on the board.");
      // Where the paper hangs before the move: a move inside the same square sends no text.
      const before = square ? await paperOnBoard(kind, itemId).catch(() => null) : null;
      if (!(await movePaper(kind, itemId, square))) return refuse("That paper is not on the board any more.", 404);
      if (square && before && before.square !== square) {
        after(() => notifyBoardSquare({ square, byStaffId, paperId: before.itemId, title: before.title, accountName: before.accountName, notes: before.notes, origin, routeContext: "board/move" }));
      }
      return NextResponse.json({ success: true });
    }

    if (action === "take") {
      if (!kind || !itemId) return refuse("kind and itemId are required.");
      if (!(await takePaper(kind, itemId, by, body.on !== false))) return refuse("That paper is not on the board any more.", 404);
      return NextResponse.json({ success: true });
    }

    if (action === "done") {
      if (!kind || !itemId) return refuse("kind and itemId are required.");
      // An extra job is done on its own page, where the after photo goes; the paper then comes down by itself.
      if (isExtraJobPaper(kind, itemId) && body.on !== false) return refuse("Mark this job Done on its own page. It needs an after photo.");
      if (!(await finishPaper(kind, itemId, by, body.on !== false))) return refuse("That paper was not found.", 404);
      return NextResponse.json({ success: true });
    }

    // "Pin to board" on a record's own screen. The record is only read; the paper points at it.
    if (action === "pinRecord") {
      const type = clean(body.type);
      const recordId = clean(body.recordId);
      const square = clean(body.square);
      if (!isPinType(type) || !recordId) return refuse("type and recordId are required.");
      if (!PIN_TYPES.find((entry) => entry.type === type)?.available) return refuse("That kind of record cannot be pinned yet.");
      // An account pinned from its Print PDF button goes up whatever the Accounts switch says; everything else follows it.
      const fromPrintPdf = type === "account" && clean(body.from) === "printPdf";
      if (!fromPrintPdf && !(await getPinTypes())[type].show) return refuse("Pin to board is switched off for that kind of record.", 409);
      if (square && !(await listBoardManagers()).some((manager) => manager.id === square)) return refuse("That person has no square on the board.");
      const before = square ? await recordPaper(type, recordId).catch(() => null) : null;
      // An account update's paper carries its notes; the other kinds send none.
      // No square: Office, or one of the shared boxes a note can hang in.
      const box = clean(body.box);
      if (box && (square || !(NOTE_BOXES as readonly string[]).includes(box))) return refuse("That box cannot take this paper.");
      const pinned = await pinRecord({ type, recordId, title: clean(body.title), accountId: clean(body.accountId), accountName: clean(body.accountName), square, box, forWho: clean(body.forWho), dueDate: clean(body.dueDate), notes: clean(body.notes), ...(fromPrintPdf ? { from: "printPdf" as const } : {}) }, by);
      if (!pinned) return refuse("That record was not found, so it was not pinned.", 404);
      if (square && before?.square !== square) {
        after(async () => {
          // A to-do just made for this manager already sent them the To-Do text.
          if (type === "todo" && (await toDoTextCoversSquare(recordId, square))) return;
          await notifyBoardSquare({ square, byStaffId, paperId: `${type}-${recordId}`, title: clean(body.title), accountName: clean(body.accountName), notes: clean(body.notes), origin, routeContext: "board/pinRecord" });
        });
      }
      return NextResponse.json({ success: true });
    }

    // The board's own "tap a box to add": the to-do or account update was just
    // saved by its own API; this hangs its paper in the box that was tapped.
    if (action === "pinNew") {
      const type = clean(body.type);
      const recordId = clean(body.recordId);
      const square = clean(body.square);
      if ((type !== "todo" && type !== "update") || !recordId) return refuse("type and recordId are required.");
      if (square && !(await listBoardManagers()).some((manager) => manager.id === square)) return refuse("That person has no square on the board.");
      await pinRecord({ type, recordId, title: clean(body.title), accountId: clean(body.accountId), accountName: clean(body.accountName), square, forWho: clean(body.forWho), dueDate: clean(body.dueDate), notes: clean(body.notes) }, by);
      if (square) {
        after(async () => {
          // A to-do just made for this manager already sent them the To-Do text.
          if (type === "todo" && (await toDoTextCoversSquare(recordId, square))) return;
          await notifyBoardSquare({ square, byStaffId, paperId: `${type}-${recordId}`, title: clean(body.title), accountName: clean(body.accountName), notes: clean(body.notes), origin, routeContext: "board/pinNew" });
        });
      }
      return NextResponse.json({ success: true });
    }

    // "Unpin" on a record's own screen: the paper comes down; the record is not touched.
    if (action === "unpinRecord") {
      const type = clean(body.type);
      const recordId = clean(body.recordId);
      if (!isPinType(type) || !recordId) return refuse("type and recordId are required.");
      if (!(await unpinRecord(type, recordId, by))) return refuse("It was not on the board any more.", 404);
      return NextResponse.json({ success: true });
    }

    // Settings -> Pin Board -> "Pin to board": which kinds of record offer it (owner only).
    if (action === "savePinTypes") {
      if (identity.role !== "owner") return refuse("Only the owner can change this.", 403);
      if (!(await pinSettingsReady())) return refuse("This database is not ready for that setting yet.", 409);
      return NextResponse.json({ success: true, pinTypes: await savePinTypes(readPinTypes(body.pinTypes), by) });
    }

    if (action === "saveSettings") {
      if (identity.role !== "owner") return refuse("Only the owner can change this.", 403);
      const current = await getBoardSettings();
      // Each of the two numbers is saved when it is sent; the other one stays.
      const days = body.oldAfterDays === undefined ? current.oldAfterDays : Math.round(Number(body.oldAfterDays));
      if (!Number.isFinite(days) || days < 1 || days > 60) return refuse("Days must be a number from 1 to 60.");
      const doneDays = body.doneDays === undefined ? current.doneDays : Math.round(Number(body.doneDays));
      if (!Number.isFinite(doneDays) || doneDays < 1 || doneDays > 90) return refuse("Days in the Done tray must be a number from 1 to 90.");
      return NextResponse.json({ success: true, settings: await saveBoardSettings({ oldAfterDays: days, doneDays }, by) });
    }

    if (action === "createTvLink") {
      if (identity.role !== "owner") return refuse("Only the owner can make a TV link.", 403);
      const { token } = await createTvLink(clean(body.label) || "Office TV", by);
      // The only time the token leaves the server. It is not logged.
      return NextResponse.json({ success: true, token }, noStore);
    }

    // "Show on TV": the 6-digit code a waiting TV is showing.
    if (action === "connectTv") {
      if (identity.role !== "owner") return refuse("Only the owner can connect a TV.", 403);
      const code = clean(body.code).replace(/\D/g, "");
      if (code.length !== 6) return refuse("Type the 6 numbers showing on the TV.");
      if (!(await connectTv(code, clean(body.label) || "Office TV", by))) {
        return refuse("That code did not match a TV. Codes last 10 minutes: check the numbers on the TV and try again.", 404);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "revokeTvLink") {
      if (identity.role !== "owner") return refuse("Only the owner can turn off a TV link.", 403);
      if (!(await revokeTvLink(clean(body.id), by))) return refuse("That link is already off.", 404);
      return NextResponse.json({ success: true });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[board POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
