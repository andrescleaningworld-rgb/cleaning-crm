import { NextRequest, NextResponse } from "next/server";

const ADMIN_SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN || "";

const PUBLIC_PATHS = [
  "/login",
  "/subcontractor-portal",
  "/subcontractor-page",
  "/api/login",
  "/api/logout",
  "/api/subcontractor-portal",
  "/favicon.ico",
  "/cw-logo.jpg",
];

function isPublicPath(pathname: string) {
  if (pathname.startsWith("/_next")) return true;

  return PUBLIC_PATHS.some((path) => {
    return pathname === path || pathname.startsWith(`${path}/`);
  });
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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
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