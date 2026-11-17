// CW Now (Crew Link): an account's crew list and its send log
// (lib/pg/crew-link-people.ts). Staff only: the proxy.ts admin gate, and
// the logged-in staff member is who "sent" it.
//
// GET  ?accountId=…                        { ready, people, lastUsedAt }
// POST { action: "save", accountId, id?, name, phone, language, tabId }
// POST { action: "remove", accountId, id }
// POST { action: "sent", accountId, id, method }   (whatsapp / copy / phone / print)
// Every POST answers with the list again.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { isCrewLang, isCrewSendMethod } from "@/lib/crewLinkPeople";
import { PEOPLE_NOT_READY, crewPeople, crewPeopleReady, recordSend, removePerson, savePerson } from "@/lib/pg/crew-link-people";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, ...noStore });
const idOf = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const accountId = request.nextUrl.searchParams.get("accountId")?.trim() ?? "";
    if (!accountId) return refuse("accountId is required.", 400);
    return NextResponse.json({ success: true, ...(await crewPeople(accountId)) }, noStore);
  } catch (error) {
    console.error("[crew-link/people GET]", error instanceof Error ? error.message : error);
    return refuse("The crew list did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await getAdminIdentity(request);
    if (!who) return refuse("Log in first.", 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accountId = String(body.accountId ?? "").trim();
    if (!accountId) return refuse("accountId is required.", 400);
    if (!(await crewPeopleReady())) return refuse(PEOPLE_NOT_READY, 409);
    const by = (who.name ?? "").trim() || "Office";

    if (body.action === "save") {
      await savePerson({
        accountId,
        id: idOf(body.id),
        name: String(body.name ?? ""),
        phone: String(body.phone ?? ""),
        language: isCrewLang(body.language) ? body.language : "en",
        tabId: idOf(body.tabId),
        by,
      });
    } else if (body.action === "remove") {
      const id = idOf(body.id);
      if (!id) return refuse("Which person?", 400);
      await removePerson(accountId, id);
    } else if (body.action === "sent") {
      const id = idOf(body.id);
      if (!id || !isCrewSendMethod(body.method)) return refuse("Which person, and how?", 400);
      await recordSend(accountId, id, body.method, by);
    } else {
      return refuse("Say what to do.", 400);
    }
    return NextResponse.json({ success: true, ...(await crewPeople(accountId)) }, noStore);
  } catch (error) {
    console.error("[crew-link/people POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "That did not save.", 500);
  }
}
