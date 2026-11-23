// CW Now: an account's shift time and its text switch, the checklist library,
// and checklist completion by sub. Staff only (proxy.ts admin gate, checked again here).
//
// GET ?accountId=…    { ready, shift, textsOn, status }
// GET ?view=library   { saved }
// GET ?view=completion { subs }
// POST { action: "saveShift", accountId, startTime, endTime, textOn }
// POST { action: "saveLibrary", name, accountId, tabId }

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { listActiveTabs } from "@/lib/checklistDb";
import { checklistLibraryReady, listLibrary, saveToLibrary } from "@/lib/pg/checklist-library";
import { checklistCompletion, crewShiftsReady, getShift, missedSinceLastChecklist, saveShift } from "@/lib/pg/crew-shifts";
import { rolloutOn } from "@/lib/rollout";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });
const clean = (value: unknown) => String(value ?? "").trim();

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const params = request.nextUrl.searchParams;
    if (params.get("view") === "library") return NextResponse.json({ success: true, ready: await checklistLibraryReady(), saved: await listLibrary() }, noStore);
    if (params.get("view") === "completion") return NextResponse.json({ success: true, subs: await checklistCompletion() }, noStore);
    const accountId = clean(params.get("accountId"));
    if (!accountId) return refuse("accountId is required.");
    const missedDays = params.get("status") === "1" ? await missedSinceLastChecklist(accountId).catch(() => null) : null;
    return NextResponse.json({ success: true, ready: await crewShiftsReady(), shift: await getShift(accountId), textsOn: rolloutOn("SHIFT_TEXTS"), missedDays }, noStore);
  } catch (error) {
    console.error("[crew-link/shift GET]", error instanceof Error ? error.message : error);
    return refuse("It did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accountId = clean(body.accountId);
    if (!accountId) return refuse("accountId is required.");

    if (body.action === "saveShift") {
      if (!(await crewShiftsReady())) return refuse("Shift times turn on after database update 090.", 409);
      try {
        return NextResponse.json({ success: true, shift: await saveShift(accountId, { startTime: clean(body.startTime), endTime: clean(body.endTime), textOn: body.textOn === true }, by) }, noStore);
      } catch (error) {
        return refuse(error instanceof Error ? error.message : "That did not save.");
      }
    }

    if (body.action === "saveLibrary") {
      if (!(await checklistLibraryReady())) return refuse("Saved checklists turn on after database update 090.", 409);
      const name = clean(body.name);
      if (!name) return refuse("Give it a name.");
      const tabs = await listActiveTabs(accountId);
      const tab = tabs.find((entry) => entry.id === Number(body.tabId)) ?? tabs[0];
      if (!tab || !tab.sections.some((section) => section.items.length > 0)) return refuse("This account has no checklist to save.");
      await saveToLibrary(name, tab.sections, by);
      return NextResponse.json({ success: true, saved: await listLibrary() }, noStore);
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[crew-link/shift POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
