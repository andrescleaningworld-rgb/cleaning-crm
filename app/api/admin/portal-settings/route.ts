import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import { getOfficePhone, isPortalOpen, setOfficePhone, setPortalOpen } from "@/lib/pg/portal-auth";
import { newPortalOn } from "@/lib/portalSession";

// The "Portal open to customers" setting. Staff only (proxy.ts).
//
// GET  → { available, open, ready, officePhone }   ready = how many customers could log in if it were open
// POST { open: boolean }  or  { officePhone: string }

async function readiness() {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT count(*) FILTER (WHERE btrim(a.email) <> '')::int AS with_email, count(*)::int AS total
     FROM accounts a
     WHERE NOT a.is_test AND a.id IS NOT NULL AND a.status_key NOT IN ('cancelled', 'canceled')
       AND EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = a.id AND upper(btrim(p.portal_access)) = 'YES')`
  )) as { with_email: number; total: number }[];
  return { withEmail: rows[0]?.with_email ?? 0, total: rows[0]?.total ?? 0 };
}

export async function GET() {
  if (!newPortalOn()) return NextResponse.json({ available: false, open: false, ready: { withEmail: 0, total: 0 }, officePhone: "" });
  try {
    return NextResponse.json({ available: true, open: await isPortalOpen(), ready: await readiness(), officePhone: await getOfficePhone() });
  } catch (err) {
    console.error("[admin/portal-settings GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to load the setting." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!newPortalOn()) return NextResponse.json({ error: "The new customer portal is not running here yet." }, { status: 409 });
  let body: { open?: unknown; officePhone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.officePhone === "string") {
    try {
      const actor = await getAdminIdentity(request);
      return NextResponse.json({ success: true, officePhone: await setOfficePhone(body.officePhone, actor?.name || "staff") });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save the number." }, { status: 400 });
    }
  }
  if (typeof body.open !== "boolean") return NextResponse.json({ error: "open must be true or false." }, { status: 400 });
  try {
    const actor = await getAdminIdentity(request);
    await setPortalOpen(body.open, actor?.name || "staff");
    return NextResponse.json({ success: true, open: body.open });
  } catch (err) {
    console.error("[admin/portal-settings POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to save the setting." }, { status: 500 });
  }
}
