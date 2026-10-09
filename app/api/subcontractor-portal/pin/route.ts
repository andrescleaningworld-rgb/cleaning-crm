// PIN login for subcontractors.
//   GET            is PIN login on, and does this phone know its sub?
//   GET ?token=    is this personal setup link still good?
//   POST setup     pick a PIN from a setup link (logs in, remembers the phone 90 days)
//   POST login     the PIN on a remembered phone (5 wrong tries, then 15 minutes)
//   POST forget    this phone forgets its sub (back to the email login)
// The email login stays as it is, as the fallback. The PIN is never logged.

import { NextRequest, NextResponse } from "next/server";
import { getSubPortalByEmail, subPortalOnPostgres } from "@/lib/data/sub-portal";
import { firstNameOf, readSubDevice, readSubSession } from "@/lib/subDevice";
import { checkPin, hasPin, isPin, setPin, setupLinkEmail, subHomeReady, markSetupLinkUsed } from "@/lib/pg/sub-home";

const refuse = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

async function on() {
  return subPortalOnPostgres() && (await subHomeReady());
}

/** The sub this email belongs to, when they may use the portal. */
async function subFor(email: string) {
  const portal = await getSubPortalByEmail(email);
  if (!portal) return null;
  const sub = portal.subcontractor as Record<string, unknown>;
  const status = String(sub.status ?? "").trim().toLowerCase();
  if (status === "inactive") return null;
  const name = String(sub.subcontractorName ?? sub.companyName ?? sub.contactName ?? sub.name ?? "Subcontractor").trim();
  return {
    id: String(sub.id ?? sub.subcontractorId ?? "").trim(),
    email: String(sub.email ?? email).trim(),
    name,
    firstName: firstNameOf(String(sub.contactName ?? sub.name ?? name)),
  };
}

async function logIn(request: NextRequest, response: NextResponse, sub: { id: string; email: string; name: string; firstName: string }) {
  const session = await readSubSession(request, response);
  session.subcontractorId = sub.id;
  session.subcontractorEmail = sub.email;
  session.subcontractorName = sub.name;
  await session.save();
  const device = await readSubDevice(request, response);
  device.email = sub.email;
  device.firstName = sub.firstName;
  await device.save();
}

export async function GET(request: NextRequest) {
  try {
    if (!(await on())) return NextResponse.json({ success: true, on: false });
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (token) {
      const email = await setupLinkEmail(token);
      const sub = email ? await subFor(email) : null;
      return NextResponse.json({ success: true, on: true, linkOk: Boolean(sub), firstName: sub?.firstName ?? "" });
    }
    const device = await readSubDevice(request, NextResponse.json({}));
    const known = device.email && (await hasPin(device.email)) ? { firstName: device.firstName ?? "" } : null;
    return NextResponse.json({ success: true, on: true, device: known }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[sub pin GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: true, on: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await on())) return refuse("PIN login is not available here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "forget") {
      const response = NextResponse.json({ success: true });
      (await readSubDevice(request, response)).destroy();
      return response;
    }

    if (action === "setup") {
      const token = String(body.token ?? "");
      if (!isPin(body.pin)) return refuse("The PIN is 4 numbers.");
      const email = await setupLinkEmail(token);
      const sub = email ? await subFor(email) : null;
      if (!sub) return refuse("This link no longer works. Ask your manager for a new one.", 410);
      await setPin(sub.email, body.pin);
      await markSetupLinkUsed(token);
      const response = NextResponse.json({ success: true, firstName: sub.firstName });
      await logIn(request, response, sub);
      return response;
    }

    if (action === "login") {
      const device = await readSubDevice(request, NextResponse.json({}));
      if (!device.email) return refuse("This phone is not set up for a PIN. Use your email.", 401);
      const result = await checkPin(device.email, String(body.pin ?? ""));
      if (!result.ok) {
        return refuse(result.reason === "locked" ? "locked" : result.reason === "no-pin" ? "no-pin" : "wrong", result.reason === "locked" ? 429 : 401, {
          reason: result.reason,
          triesLeft: result.triesLeft,
          minutes: result.minutes,
        });
      }
      const sub = await subFor(device.email);
      if (!sub) return refuse("Your account is not active. Call your manager.", 401);
      const response = NextResponse.json({ success: true, firstName: sub.firstName });
      await logIn(request, response, sub);
      return response;
    }

    return refuse(`Unknown action "${action}".`);
  } catch (error) {
    console.error("[sub pin POST]", error instanceof Error ? error.message : error);
    return refuse("That did not work. Try again.", 500);
  }
}
