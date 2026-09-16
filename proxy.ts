import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";

// No cookie of any kind required. /api/subcontractor-portal stays here even
// though most of its actions require a logged-in sub — it's a single POST
// dispatcher that also handles the sub login action itself, so per-action
// auth is enforced inside that route handler, not here (proxy can't inspect
// the POST body to tell "login" apart from "everything else").
const PUBLIC_PATHS = [
  "/login",
  "/portal",
  "/api/portal",
  "/customer-portal",
  "/api/customer-portal",
  "/subcontractor-portal",
  "/subcontractor-page",
  // Covers /api/login, /api/login/identities, /api/login/owner, and
  // /api/login/setup-password (prefix match) — all must be reachable while
  // logged out, since they're how a login session gets created in the
  // first place.
  "/api/login",
  "/api/logout",
  "/api/subcontractor-portal",
  "/favicon.ico",
  "/cw-logo.jpg",
  // The header/branding logo (CWHeader, customer portal login, and the
  // Porter Checklist module) — served as a static /public asset and must be
  // fetchable on every logged-out page (customer portal, subcontractor
  // portal, the no-login porter link), not just admin-authenticated ones.
  "/logo-CW-single-phone-optimized.png",
  "/sw.js",
  "/manifest.json",
  "/manifest.webmanifest",
  // OneSignal's service worker file must be fetchable pre-login (it's
  // requested directly by the browser during OneSignal.init(), not via an
  // authenticated page navigation) — same reasoning as manifest.json above.
  "/push/onesignal",
  // /help must be reachable by subcontractors and customers too, not just
  // admins — it now reads the session itself (via /api/session-role) to
  // decide which content to show, rather than gating access to the page.
  "/help",
  "/api/session-role",
  // Polled by VersionCheckBanner (rendered in the root layout) from every
  // portal, including subcontractor and customer sessions with no admin
  // cookie — must not redirect to /login like a gated API route would.
  "/api/version",
  // Porter Checklist submission form — no-login link handed to porters
  // directly (text/email/WhatsApp). Deliberately isolated under its own
  // "/porter" prefix (not "/porter-checklist") so it can never collide with
  // "/porter-checklist/submissions", the password-gated admin view, which
  // must stay behind the normal admin cookie gate.
  "/porter",
  "/api/porter-checklist",
];

// Dedicated, single-purpose subcontractor endpoints (no mixed login action
// like /api/subcontractor-portal has) — these can be gated outright on a
// valid sub_session rather than self-checking per action.
const SUB_PATHS = [
  "/api/subcontractor-visits",
  "/api/subcontractor-schedules",
  "/api/subcontractor-schedule-exceptions",
];

// Shared between staff pages and the subcontractor portal — accept either a
// valid admin session or a valid sub session.
const SUB_OR_ADMIN_PATHS = ["/api/photos", "/api/supplies"];

// Owner-only — requires the admin identity session's role to be "owner",
// not just any logged-in manager. Checked after the general admin gate.
const OWNER_ONLY_PATHS = [
  "/settings/activity-log",
  "/api/admin/audit-log",
  "/api/admin/manager-accounts",
];

function matchesPath(pathname: string, list: string[]) {
  return list.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Decrypts the individual manager/owner login session (see
// lib/adminSession.ts). Replaces the old static-shared-secret cookie check —
// any manager or owner who has completed login satisfies this, matching
// today's "all managers get full existing access" requirement; only
// OWNER_ONLY_PATHS further narrows by role.
async function getAdminIdentity(request: NextRequest): Promise<AdminIdentitySession | null> {
  try {
    const response = NextResponse.next();
    const session = await getIronSession<AdminIdentitySession>(request, response, adminSessionOptions());
    if (!session.accountId || !session.role) return null;
    return session;
  } catch {
    return null;
  }
}

async function hasValidSubSession(request: NextRequest) {
  try {
    const response = NextResponse.next();
    const session = await getIronSession<SubSessionData>(request, response, subSessionOptions());
    return Boolean(session.subcontractorEmail);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (matchesPath(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  // API-only routes: return JSON on failure instead of redirecting to a page.
  // A fetch() caller that gets redirected to an HTML login page instead of
  // JSON breaks JSON.parse() client-side — this exact bug is why
  // subcontractor photo uploads and supply-item loading were silently
  // failing before this change (see /api/photos, /api/supplies below).
  if (matchesPath(pathname, SUB_PATHS)) {
    if (await hasValidSubSession(request)) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (matchesPath(pathname, SUB_OR_ADMIN_PATHS)) {
    if ((await getAdminIdentity(request)) || (await hasValidSubSession(request))) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (matchesPath(pathname, OWNER_ONLY_PATHS)) {
    const identity = await getAdminIdentity(request);
    if (identity?.role === "owner") {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: identity ? 403 : 401 });
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = identity ? "/" : "/login";
    return NextResponse.redirect(homeUrl);
  }

  if (await getAdminIdentity(request)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|cw-logo.jpg|logo-CW-single-phone-optimized.png).*)"],
};
