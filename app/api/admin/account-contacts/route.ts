// Staff only (proxy.ts default gate). An account's contacts: list, add,
// change, make main, remove. See lib/pg/account-contacts.ts. Until migration
// 034 is in this database GET answers { ready: false } and the screens show
// the account's three contact fields as before.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { isPostgres } from "@/lib/dataSource";
import { PortalConfirmNeeded, accountContactsReady, listContacts, makeMainContact, portalIsOn, removeContact, saveContact, type ContactRef } from "@/lib/pg/account-contacts";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

const on = async () => isPostgres("ACCOUNTS") && (await accountContactsReady());

export async function GET(request: NextRequest) {
  try {
    if (!(await on())) return NextResponse.json({ success: true, ready: false }, noStore);
    const accountId = clean(request.nextUrl.searchParams.get("accountId"));
    if (!accountId) return refuse("accountId is required.");
    const [contacts, portalOn] = await Promise.all([listContacts(accountId), portalIsOn(accountId)]);
    if (!contacts) return refuse("That account was not found.", 404);
    return NextResponse.json({ success: true, ready: true, contacts, portalOn }, noStore);
  } catch (error) {
    console.error("[account-contacts GET]", error instanceof Error ? error.message : error);
    return refuse("The contacts did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await on())) return refuse("Contacts are not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const accountId = clean(body.accountId);
    if (!accountId) return refuse("accountId is required.");
    const confirmPortal = body.confirmPortal === true;
    // A number, or "main" for the main contact (whose row may not exist until this save). Nothing = a new contact.
    const contactId: ContactRef | null = body.contactId === "main" ? "main" : body.contactId === null || body.contactId === undefined || body.contactId === "" ? null : Number(body.contactId);
    if (typeof contactId === "number" && !Number.isInteger(contactId)) return refuse("That contact was not found.", 404);

    try {
      if (action === "save") {
        await saveContact(accountId, contactId, { name: clean(body.name), role: clean(body.role), phone: clean(body.phone), email: clean(body.email), notes: clean(body.notes) }, by, confirmPortal);
      } else if (action === "makeMain") {
        if (typeof contactId !== "number") return refuse("That contact was not found.", 404);
        await makeMainContact(accountId, contactId, by, confirmPortal);
      } else if (action === "remove") {
        if (contactId === null) return refuse("That contact was not found.", 404);
        await removeContact(accountId, contactId, by, confirmPortal);
      } else {
        return refuse("Unknown action.");
      }
    } catch (error) {
      // The screen asks "This changes who can log in to the customer portal", then sends it again with confirmPortal.
      if (error instanceof PortalConfirmNeeded) return NextResponse.json({ success: false, needsPortalConfirm: true, error: error.message }, { status: 409 });
      return refuse(error instanceof Error ? error.message : "That did not save. Try again.");
    }

    if (identity.accountId) {
      await logActivity({
        actorAccountId: identity.accountId,
        actorRole: identity.role ?? "manager",
        actorName: identity.name || "",
        action: "update",
        entityType: "account-contact",
        entityId: accountId,
        detail: action === "save" ? (contactId === null ? "added a contact" : "changed a contact") : action === "makeMain" ? "changed the main contact" : "removed a contact",
      }).catch((error) => console.error("[account-contacts] activity log:", error instanceof Error ? error.message : error));
    }
    const contacts = await listContacts(accountId);
    return NextResponse.json({ success: true, contacts: contacts ?? [], portalOn: await portalIsOn(accountId) });
  } catch (error) {
    console.error("[account-contacts POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
