"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";
import { SHOW_TIPS_EVENT, useShell } from "@/app/ui";

type UserRole = "admin" | "subcontractor" | "customer" | null;

type NotificationsResponse = {
  success?: boolean;
  message?: string;
  newCount?: number;
};

type PortalNewCountResponse = {
  success?: boolean;
  newCount?: number;
};

const adminNavItems = [
  { href: "/", label: "Dashboard" },
  { href: "/accounts-center", label: "Accounts center" },
  { href: "/sub-center", label: "Sub Center" },
  { href: "/sales", label: "Sales" },
  { href: "/reports", label: "Reports" },
  { href: "/documents", label: "Documents" },
  { href: "/equipment", label: "Equipment" },
  { href: "/settings", label: "Settings" },
  { href: "/map", label: "Map" },
];

const subcontractorNavItems = [
  { href: "/subcontractor-portal", label: "Home" },
  { href: "/subcontractor-portal/equipment", label: "Equipment" },
];

const customerNavItems = [
  { href: "/customer-portal", label: "My Account" },
  { href: "/customer-portal/requests", label: "Requests" },
  { href: "/customer-portal/complaints", label: "Complaints" },
  { href: "/customer-portal/history", label: "History" },
];

function getStoredRole(): UserRole {
  if (typeof window === "undefined") return null;

  const role = window.localStorage.getItem("cwRole");

  if (role === "admin") return "admin";
  if (role === "subcontractor") return "subcontractor";
  if (role === "customer") return "customer";

  return null;
}

export default function CWHeader() {
  const pathname = usePathname();

  const [role, setRole] = useState<UserRole>(null);
  const [mounted, setMounted] = useState(false);
  const [newNotificationCount, setNewNotificationCount] = useState(0);
  const [portalCount, setPortalCount] = useState(0);
  // On a phone the menu is folded behind one button; on a wide screen it is always open.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Deferred read: localStorage isn't available during SSR, so reading it
    // eagerly (lazy initializer) would mismatch the server-rendered nav.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    // "storage" only fires in OTHER tabs/windows, never the one that made the
    // write — so it does nothing for the tab that just logged in. Kept for
    // genuine cross-tab sync (e.g. logging out in one tab while another is
    // open), but is not sufficient on its own — see the pathname-keyed
    // effect below for the same-tab case.
    const handleStorageChange = () => {
      setRole(getStoredRole());
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Re-reads role on every client-side navigation, not just on mount. Every
  // login page (admin/subcontractor/customer) writes to localStorage then
  // calls router.push() — a same-tab client-side navigation, not a full page
  // load — so a mount-only read here left this header showing signed-out nav
  // (no links, no notification/portal badges) until a hard refresh remounted
  // the component and re-read the now-current localStorage value. pathname
  // changes on every such navigation, giving a reliable re-check point
  // without needing a full reload.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(getStoredRole());
  }, [pathname]);

  useEffect(() => {
    if (role !== "admin") return;

    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications");

        const data: NotificationsResponse = await response.json();

        if (data.success) {
          setNewNotificationCount(Number(data.newCount || 0));
        }
      } catch {
        setNewNotificationCount(0);
      }
    }

    loadNotifications();

    const interval = window.setInterval(loadNotifications, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, [role]);

  useEffect(() => {
    if (role !== "admin") return;

    let cancelled = false;

    async function loadPortalCount() {
      try {
        const response = await fetch("/api/portal/new-count");
        const data: PortalNewCountResponse = await response.json();

        if (!cancelled && data.success) {
          setPortalCount(Number(data.newCount || 0));
        }
      } catch {
        if (!cancelled) setPortalCount(0);
      }
    }

    loadPortalCount();

    const interval = window.setInterval(loadPortalCount, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [role]);

  const navItems = useMemo(() => {
    if (!mounted) return [];
    if (role === "admin") return adminNavItems;
    if (role === "subcontractor") return subcontractorNavItems;
    if (role === "customer") return customerNavItems;
    return [];
  }, [role, mounted]);

  const isLoginPage = pathname === "/login";
  const showNav = !isLoginPage && navItems.length > 0;

  // The page name under "Cleaning World": the redesigned screen says its own
  // name (app/ui/shell.ts); older pages fall back to their menu label.
  const shell = useShell();
  const pageName = shell.title || fallbackPageName(pathname);
  const badgeTotal = newNotificationCount + portalCount;
  const pill = (active: boolean) => `cw-topbar-link ${active ? "cw-topbar-link-on" : ""}`.trim();

  return (
    <header className="cw-topbar no-print">
      <div className="cw-topbar-row">
        {shell.backHref ? (
          <Link href={shell.backHref} className="cw-topbar-btn" aria-label="Back">
            <BackArrow />
          </Link>
        ) : shell.onBack ? (
          <button type="button" className="cw-topbar-btn" aria-label="Back" onClick={shell.onBack}>
            <BackArrow />
          </button>
        ) : null}

        {/* cw-emblem.png is the emblem with no empty margin (276x180). The
            box never shrinks, and the image keeps its own proportions. */}
        <div className="cw-topbar-logo">
          <Image src="/cw-emblem.png" alt="" width={276} height={180} priority unoptimized className="h-full w-full object-contain" />
        </div>

        <div className="cw-topbar-names">
          <p className="cw-topbar-brand">Cleaning World</p>
          <h1 className="cw-topbar-page">{pageName}</h1>
        </div>

        {!isLoginPage &&
          (shell.tipsCount > 0 ? (
            <button
              type="button"
              className="cw-topbar-btn"
              aria-label="Show the tips for this screen"
              title="Show tips"
              onClick={() => window.dispatchEvent(new Event(SHOW_TIPS_EVENT))}
            >
              ?
            </button>
          ) : (
            <Link href="/help" className="cw-topbar-btn" aria-label="Help" title="Help / Tutorial">
              ?
            </Link>
          ))}

        {showNav && (
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="cw-header-nav"
            className="cw-topbar-btn cw-topbar-menu"
          >
            {menuOpen ? "Close" : "Menu"}
            {!menuOpen && badgeTotal > 0 && <span className="cw-topbar-badge">{badgeTotal}</span>}
          </button>
        )}
      </div>

      {showNav && (
        <nav id="cw-header-nav" onClick={() => setMenuOpen(false)} className={`cw-topbar-nav ${menuOpen ? "cw-topbar-nav-open" : ""}`.trim()}>
          {role === "admin" && (
            <Link href="/notifications" className={pill(pathname === "/notifications")}>
              🔔 Notifications
              {newNotificationCount > 0 && <span className="cw-topbar-badge">{newNotificationCount}</span>}
            </Link>
          )}

          {role === "admin" && (
            <Link href="/portal-requests" className={pill(pathname === "/portal-requests")}>
              Portal
              {portalCount > 0 && <span className="cw-topbar-badge">{portalCount}</span>}
            </Link>
          )}

          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={pill(isActive)}>
                {item.label}
              </Link>
            );
          })}

          {/* The "?" in the bar shows a screen's tips when it has some, so Help also lives here. */}
          {role === "admin" && (
            <Link href="/help" className={pill(pathname === "/help")}>
              Help
            </Link>
          )}

          {role === "admin" && <LogoutButton />}
        </nav>
      )}
    </header>
  );
}

function BackArrow() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

const PAGE_NAMES: Record<string, string> = {
  "": "Dashboard",
  login: "Log in",
  accounts: "Accounts",
  "accounts-center": "Accounts Center",
  "sub-center": "Sub Center",
  subcontractors: "Subcontractors",
  "subcontractor-portal": "Subcontractor Portal",
  "customer-portal": "Customer Portal",
  portal: "Customer Portal",
  "portal-requests": "Portal Requests",
  "to-do": "To-Do",
  "sub-schedules": "Sub Schedules",
  "supply-orders": "Supply Orders",
  "team-hub": "Crew Link",
  "crew-link": "Crew Link",
};

function fallbackPageName(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  if (PAGE_NAMES[first]) return PAGE_NAMES[first];
  return first.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
