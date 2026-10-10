// Office Pin Board API (/board). Staff only (proxy.ts default gate).
// Postgres only; see lib/pg/board.ts. When the board is switched off or its
// tables are not in this database yet, GET answers { ready: false } and the
// page says so.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import type { BoardData, BoardMe } from "@/lib/board";
import { PIN_TYPES, isPinType, readPinTypes, type PinInfo } from "@/lib/boardPins";
import { getPinTypes, listPinnedRecords, pinRecord, pinSettingsReady, savePinTypes, syncPinnedTodos, unpinRecord } from "@/lib/pg/board-pins";
import {
  boardReady,
  createTvLink,
  finishPaper,
  getBoardSettings,
  isExtraJobPaper,
  listBoardManagers,
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
        WHERE id IS NOT NULL AND btrim(account_name) <> '' AND status_key <> 'cancelled'
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

    // Settings -> Pin Board: the days setting and the TV links (owner only).
    if (view === "settings") {
      if (identity?.role !== "owner") return refuse("Only the owner can see the TV links.", 403);
      const [settings, links, pinTypes, pinReady] = await Promise.all([getBoardSettings(), listTvLinks(), getPinTypes(), pinSettingsReady()]);
      return NextResponse.json({ success: true, ready: true, settings, links, pinTypes, pinReady }, noStore);
    }

    await syncBoard();
    // Pinned to-dos get their green check (and come down the day after) from the to-do itself.
    await syncPinnedTodos().catch((error) => console.error("[board] pinned to-dos:", error instanceof Error ? error.message : error));
    const [settings, managers, lists] = await Promise.all([getBoardSettings(), listBoardManagers(), listPapers()]);
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

    // "+ Pin something": a to-do. Extra jobs are not pinned by hand: they are set up on the Extra Jobs form and pin themselves.
    if (action === "pin") {
      if (kind === "extra") return refuse("Set the extra job up with the Extra job button. It pins itself.");
      const text = clean(body.text);
      const square = clean(body.square);
      if (!text) return refuse("Write a few words first.");
      if (!square) return refuse("Pick whose square it goes in.");
      if (!(await listBoardManagers()).some((manager) => manager.id === square)) return refuse("That person has no square on the board.");
      const id = await pinPaper({ text, accountId: clean(body.accountId), accountName: clean(body.accountName), square, by });
      return NextResponse.json({ success: true, itemId: id });
    }

    if (action === "move") {
      const square = clean(body.square);
      if (!kind || !itemId) return refuse("kind and itemId are required.");
      if (square && !(await listBoardManagers()).some((manager) => manager.id === square)) return refuse("That person has no square on the board.");
      if (!(await movePaper(kind, itemId, square))) return refuse("That paper is not on the board any more.", 404);
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
      if (!(await getPinTypes())[type].show) return refuse("Pin to board is switched off for that kind of record.", 409);
      if (square && !(await listBoardManagers()).some((manager) => manager.id === square)) return refuse("That person has no square on the board.");
      const pinned = await pinRecord({ type, recordId, title: clean(body.title), accountId: clean(body.accountId), accountName: clean(body.accountName), square, forWho: clean(body.forWho), dueDate: clean(body.dueDate) }, by);
      if (!pinned) return refuse("That record was not found, so it was not pinned.", 404);
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
      const days = Math.round(Number(body.oldAfterDays));
      if (!Number.isFinite(days) || days < 1 || days > 60) return refuse("Days must be a number from 1 to 60.");
      return NextResponse.json({ success: true, settings: await saveBoardSettings({ oldAfterDays: days }, by) });
    }

    if (action === "createTvLink") {
      if (identity.role !== "owner") return refuse("Only the owner can make a TV link.", 403);
      const { token } = await createTvLink(clean(body.label) || "Office TV", by);
      // The only time the token leaves the server. It is not logged.
      return NextResponse.json({ success: true, token }, noStore);
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
