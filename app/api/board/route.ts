// Office Pin Board API (/board). Staff only (proxy.ts default gate).
// Postgres only; see lib/pg/board.ts. When the board is switched off or its
// tables are not in this database yet, GET answers { ready: false } and the
// page says so.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import type { BoardData, BoardMe } from "@/lib/board";
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

    // Settings -> Pin Board: the days setting and the TV links (owner only).
    if (view === "settings") {
      if (identity?.role !== "owner") return refuse("Only the owner can see the TV links.", 403);
      const [settings, links] = await Promise.all([getBoardSettings(), listTvLinks()]);
      return NextResponse.json({ success: true, ready: true, settings, links }, noStore);
    }

    await syncBoard();
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
      if (!square && kind === "note") return refuse("A to-do stays in a person's square.");
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
