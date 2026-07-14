import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";

const ADMIN_SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN || "";

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
  "/api/login",
  "/api/logout",
  "/api/subcontractor-portal",
  "/favicon.ico",
  "/cw-logo.jpg",
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
// valid admin cookie or a valid sub session.
const SUB_OR_ADMIN_PATHS = ["/api/photos", "/api/supplies"];

function matchesPath(pathname: string, list: string[]) {
  return list.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function hasValidAdminSession(request: NextRequest) {
  const possibleCookies = [
    "admin_session",
    "cw_admin_session",
    "cleaning_world_admin_session",
  ];

  return possibleCookies.some((cookieName) => {
    return request.cookies.get(cookieName)?.value === ADMIN_SESSION_TOKEN;
  });
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
    if (hasValidAdminSession(request) || (await hasValidSubSession(request))) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (hasValidAdminSession(request)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|cw-logo.jpg).*)"],
};
