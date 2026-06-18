import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cw_admin_session";

function isPublicPath(pathname: string, method: string) {
  if (pathname === "/login") return true;
  if (pathname === "/api/login") return true;
  if (pathname === "/api/logout") return true;

  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/images")) return true;
  if (pathname.startsWith("/public")) return true;
  if (pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js)$/)) {
    return true;
  }

  // Public subcontractor portal page
  if (pathname === "/subcontractor-portal") return true;
  if (pathname.startsWith("/subcontractor-portal/")) return true;

  // Public API needed by subcontractor portal
  if (pathname.startsWith("/api/subcontractor-portal")) return true;

  // Supply list API can stay public because portal needs the supply list.
  if (pathname.startsWith("/api/supplies")) return true;

  // Allow subcontractors to submit orders.
  // GET supply orders stays protected because it shows admin order list data.
  if (pathname === "/api/supply-orders" && method === "POST") return true;

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (isPublicPath(pathname, method)) {
    return NextResponse.next();
  }

  const expectedToken = process.env.ADMIN_SESSION_TOKEN || "";
  const currentToken = request.cookies.get(COOKIE_NAME)?.value || "";

  if (expectedToken && currentToken === expectedToken) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};