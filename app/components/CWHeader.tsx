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

type NavItem = { href: string; label: string; icon: SideIconName };
type NavGroup = { name: string; items: NavItem[] };

// The sidebar, top to bottom. Every place staff can go is here.
const ADMIN_GROUPS: NavGroup[] = [
  {
    name: "Daily",
    items: [
      { href: "/", label: "Dashboard", icon: "home" },
      { href: "/accounts-center", label: "Accounts center", icon: "accounts" },
      { href: "/to-do", label: "To-Do", icon: "todo" },
      { href: "/sub-center", label: "Sub Center", icon: "subs" },
    ],
  },
  {
    name: "Work",
    items: [
      { href: "/complaints", label: "Complaints", icon: "problem" },
      { href: "/visits", label: "Visits", icon: "visit" },
      { href: "/extra-jobs", label: "Extra Jobs", icon: "extra" },
      { href: "/supplies", label: "Supplies", icon: "supplies" },
      { href: "/supply-orders", label: "Supply Orders", icon: "orders" },
      { href: "/crew-link", label: "Crew Link", icon: "crew" },
    ],
  },
  {
    name: "Office",
    items: [
      { href: "/sales", label: "Sales", icon: "sales" },
      { href: "/reports", label: "Reports", icon: "reports" },
      { href: "/documents", label: "Documents", icon: "documents" },
      { href: "/equipment", label: "Equipment", icon: "equipment" },
      { href: "/map", label: "Map", icon: "map" },
      { href: "/portal-requests", label: "Portal Requests", icon: "portal" },
      { href: "/notifications", label: "Notifications", icon: "bell" },
    ],
  },
];

// Pinned to the bottom of the sidebar, above Logout.
const ADMIN_FOOT: NavItem[] = [
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/help", label: "Help", icon: "help" },
];

const SUBCONTRACTOR_GROUPS: NavGroup[] = [
  {
    name: "Menu",
    items: [
      { href: "/subcontractor-portal", label: "Home", icon: "home" },
      { href: "/subcontractor-portal/equipment", label: "Equipment", icon: "equipment" },
    ],
  },
];

const CUSTOMER_GROUPS: NavGroup[] = [
  {
    name: "Menu",
    items: [
      { href: "/customer-portal", label: "My Account", icon: "home" },
      { href: "/customer-portal/requests", label: "Requests", icon: "portal" },
      { href: "/customer-portal/complaints", label: "Complaints", icon: "problem" },
      { href: "/customer-portal/history", label: "History", icon: "visit" },
    ],
  },
];

const SIDE_COLLAPSED_KEY = "cwSideCollapsed";

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
  // Phones: the sidebar slides in when Menu is tapped. Wide screens: it is always there.
  const [menuOpen, setMenuOpen] = useState(false);
  // Wide screens: icons only, remembered on this device.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Deferred read: localStorage isn't available during SSR, so reading it
    // eagerly (lazy initializer) would mismatch the server-rendered nav.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      setCollapsed(window.localStorage.getItem(SIDE_COLLAPSED_KEY) === "1");
    } catch {
      // Private mode: the sidebar simply starts with its names showing.
    }

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

  const navGroups = useMemo<NavGroup[]>(() => {
    if (!mounted) return [];
    if (role === "admin") return ADMIN_GROUPS;
    if (role === "subcontractor") return SUBCONTRACTOR_GROUPS;
    if (role === "customer") return CUSTOMER_GROUPS;
    return [];
  }, [role, mounted]);

  // While the slide-in menu is open on a phone, the page behind it does not scroll.
  useEffect(() => {
    if (!menuOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [menuOpen]);

  const isLoginPage = pathname === "/login";
  const showNav = !isLoginPage && navGroups.length > 0;

  // The page name under "Cleaning World": the redesigned screen says its own
  // name (app/ui/shell.ts); older pages fall back to their menu label.
  const shell = useShell();
  const pageName = shell.title || fallbackPageName(pathname);
  const badgeTotal = newNotificationCount + portalCount;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const badgeFor = (href: string) => (href === "/notifications" ? newNotificationCount : href === "/portal-requests" ? portalCount : 0);

  // Every page has a back arrow except home. A screen can say where its
  // arrow goes; otherwise it goes one level up, and from a top-level page, home.
  const home = role === "subcontractor" ? "/subcontractor-portal" : role === "customer" ? "/portal" : "/";
  const isHome = pathname === home || pathname === "/" || pathname === "/portal" || pathname === "/customer-portal" || pathname === "/subcontractor-portal";
  const isLogin = pathname.endsWith("/login") || pathname.startsWith("/portal/forgot") || pathname.startsWith("/portal/set-password");
  const parent = "/" + pathname.split("/").filter(Boolean).slice(0, -1).join("/");
  const fallbackBack = mounted && role && !isHome && !isLogin ? (parent === "/" ? home : parent) : "";
  const backHref = shell.backHref || (shell.onBack ? "" : fallbackBack);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDE_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Not remembered, still switched for now.
    }
  }

  const sideLink = (item: NavItem) => {
    const badge = badgeFor(item.href);
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`cw-side-link ${active ? "cw-side-link-on" : ""}`.trim()}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
      >
        <SideIcon name={item.icon} />
        <span className="cw-side-label">{item.label}</span>
        {badge > 0 ? (
          <span className="cw-topbar-badge cw-side-badge" aria-label={`${badge} new`}>
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <>
      <header className="cw-topbar no-print">
        <div className="cw-topbar-row">
          {/* Phones only: slides the sidebar in. On a wide screen the sidebar is always there. */}
          {showNav && (
            <button type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="cw-side" className="cw-topbar-btn cw-topbar-menu">
              Menu
              {badgeTotal > 0 && <span className="cw-topbar-badge">{badgeTotal}</span>}
            </button>
          )}

          {isHome ? null : backHref ? (
            <Link href={backHref} className="cw-topbar-btn" aria-label="Back">
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

          {shell.extra ? (
            <button type="button" className="cw-topbar-btn" aria-label={shell.extra.ariaLabel} onClick={shell.extra.onClick}>
              {shell.extra.label}
            </button>
          ) : null}

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
        </div>
      </header>

      {showNav && (
        <>
          <div className={`cw-side-backdrop no-print ${menuOpen ? "cw-side-backdrop-on" : ""}`.trim()} onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside
            id="cw-side"
            aria-label="Sections"
            className={`cw-side no-print ${menuOpen ? "cw-side-open" : ""} ${collapsed ? "cw-side-mini" : ""}`.replace(/\s+/g, " ").trim()}
            // A tap on any link closes the slide-in menu.
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setMenuOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenuOpen(false);
            }}
          >
            <div className="cw-side-top">
              <span className="cw-side-title">Cleaning World</span>
              <button type="button" className="cw-side-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <SideIcon name="close" />
              </button>
            </div>

            <nav className="cw-side-scroll">
              {navGroups.map((group) => (
                <div key={group.name} className="cw-side-group">
                  <p className="cw-side-heading">{group.name}</p>
                  {group.items.map(sideLink)}
                </div>
              ))}
            </nav>

            <div className="cw-side-foot">
              {role === "admin" ? ADMIN_FOOT.map(sideLink) : null}
              {role === "admin" ? (
                <LogoutButton className="cw-side-link cw-side-logout" title={collapsed ? "Logout" : undefined}>
                  <SideIcon name="logout" />
                  <span className="cw-side-label">Logout</span>
                </LogoutButton>
              ) : null}
              <button
                type="button"
                className="cw-side-link cw-side-collapse"
                onClick={toggleCollapsed}
                aria-pressed={collapsed}
                aria-label={collapsed ? "Show the names" : "Show icons only"}
                title={collapsed ? "Show the names" : undefined}
              >
                <SideIcon name={collapsed ? "expand" : "collapse"} />
                <span className="cw-side-label">Icons only</span>
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function BackArrow() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

const SIDE_ICONS = {
  home: "M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-8z",
  accounts: "M4 20V6a1 1 0 011-1h8a1 1 0 011 1v14M14 10h5a1 1 0 011 1v9M3 20h18M8 9h2M8 13h2M8 17h2",
  todo: "M9 11l3 3 8-8M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h11",
  subs: "M9 11a3 3 0 100-6 3 3 0 000 6zm-6 9a6 6 0 0112 0M17 11a3 3 0 100-6M18 14a5 5 0 013 6",
  problem: "M12 8v5m0 3.5v.5M10.3 3.9L2.6 17.3A2 2 0 004.3 20h15.4a2 2 0 001.7-2.7L13.7 3.9a2 2 0 00-3.4 0z",
  visit: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm4 9l2 2 4-4",
  supplies: "M4 8l8-4 8 4v8l-8 4-8-4V8zm0 0l8 4 8-4M12 12v8",
  orders: "M5 4h2l2 11h9l2-8H8M10 19.5a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2z",
  crew: "M4 5h16v11H9l-5 4V5zm4 4h8M8 12h5",
  sales: "M4 19h16M7 16V10m5 6V6m5 10v-4",
  extra: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm7 4v8m-4-4h8",
  reports: "M6 3h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zm3 8h6m-6 4h6",
  documents: "M4 6a1 1 0 011-1h5l2 2h7a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V6z",
  equipment: "M14 6a4 4 0 00-5 5L4 16v4h4l5-5a4 4 0 005-5l-3 3-2-2 3-3a4 4 0 00-2-2z",
  map: "M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0113 0c0 5.3-6.5 11-6.5 11zm0-8.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5z",
  portal: "M4 13l2.500-8h11L20 13v6H4v-6zm0 0h5a3 3 0 006 0h5",
  bell: "M6 16V11a6 6 0 0112 0v5l2 2H4l2-2zm4 5h4",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zm8-3l-2 .700-.500 1.300 1 1.900-1.600 1.600-1.900-1-1.300.500L13 21h-2l-.700-2-1.300-.500-1.900 1-1.600-1.600 1-1.900L6 14.700 4 14v-2l2-.700.500-1.300-1-1.900 1.600-1.600 1.900 1L10.300 7 11 5h2l.700 2 1.300.500 1.900-1 1.600 1.600-1 1.900.500 1.300 2 .700z",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zm-2.500-11.500a2.500 2.500 0 114 2c-.900.600-1.500 1.200-1.500 2.500m0 3v.010",
  logout: "M10 5H6a1 1 0 00-1 1v12a1 1 0 001 1h4M15 8l4 4-4 4M19 12H9",
  collapse: "M14 6l-6 6 6 6M19 6v12",
  expand: "M10 6l6 6-6 6M5 6v12",
  close: "M6 6l12 12M18 6L6 18",
} as const;

type SideIconName = keyof typeof SIDE_ICONS;

function SideIcon({ name }: { name: SideIconName }) {
  return (
    <svg className="cw-side-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={SIDE_ICONS[name]} />
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
