"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type UserRole = "admin" | "subcontractor" | null;

type NotificationsResponse = {
  success?: boolean;
  message?: string;
  newCount?: number;
};

const adminNavItems = [
  { href: "/", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/visits", label: "Visits" },
  { href: "/complaints", label: "Complaints" },
  { href: "/account-updates", label: "Updates" },
  { href: "/subcontractors", label: "Subs" },
  { href: "/sales", label: "Sales" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
  { href: "/map", label: "Map" },
];

const subcontractorNavItems = [
  { href: "/subcontractor-portal", label: "My Accounts" },
];

function getSavedRole(pathname: string): UserRole {
  if (typeof window === "undefined") return null;

  const cleanPath = pathname || "";

  if (cleanPath.startsWith("/login")) {
    return null;
  }

  if (cleanPath.startsWith("/subcontractor-portal")) {
    return "subcontractor";
  }

  const roleValues = [
    localStorage.getItem("cwUserRole"),
    localStorage.getItem("cwRole"),
    localStorage.getItem("userRole"),
    localStorage.getItem("role"),
    localStorage.getItem("cleaningWorldRole"),
  ]
    .map((value) => String(value || "").toLowerCase().trim())
    .filter(Boolean);

  if (roleValues.includes("admin")) {
    return "admin";
  }

  if (roleValues.includes("subcontractor") || roleValues.includes("sub")) {
    return "subcontractor";
  }

  const adminLoggedIn =
    localStorage.getItem("cwAdminLoggedIn") === "true" ||
    localStorage.getItem("isAdminLoggedIn") === "true" ||
    localStorage.getItem("adminLoggedIn") === "true" ||
    localStorage.getItem("cleaningWorldAdminLoggedIn") === "true";

  if (adminLoggedIn) {
    return "admin";
  }

  const subLoggedIn =
    localStorage.getItem("cwSubcontractorLoggedIn") === "true" ||
    localStorage.getItem("subcontractorLoggedIn") === "true" ||
    localStorage.getItem("cleaningWorldSubcontractorLoggedIn") === "true" ||
    Boolean(localStorage.getItem("cwSubcontractorEmail")) ||
    Boolean(localStorage.getItem("subcontractorEmail"));

  if (subLoggedIn) {
    return "subcontractor";
  }

  return "admin";
}

function getHomeHref(role: UserRole): string {
  if (role === "subcontractor") return "/subcontractor-portal";
  if (role === "admin") return "/";
  return "/login";
}

export default function CWHeader() {
  const pathname = usePathname();

  const [role, setRole] = useState<UserRole>(null);
  const [ready, setReady] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    setRole(getSavedRole(pathname));
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    function refreshRole() {
      setRole(getSavedRole(window.location.pathname));
      setReady(true);
    }

    window.addEventListener("storage", refreshRole);
    window.addEventListener("focus", refreshRole);

    return () => {
      window.removeEventListener("storage", refreshRole);
      window.removeEventListener("focus", refreshRole);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadNotificationCount() {
      if (role !== "admin") {
        setNotificationCount(0);
        return;
      }

      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
        });

        const data = (await response.json()) as NotificationsResponse;

        if (!isMounted) return;

        if (response.ok && data.success !== false) {
          setNotificationCount(Number(data.newCount || 0));
        }
      } catch {
        if (isMounted) {
          setNotificationCount(0);
        }
      }
    }

    loadNotificationCount();

    const interval = window.setInterval(loadNotificationCount, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [role, pathname]);

  const navItems = useMemo(() => {
    if (role === "admin") return adminNavItems;
    if (role === "subcontractor") return subcontractorNavItems;
    return [];
  }, [role]);

  return (
    <header className="cw-header">
      <div className="cw-header-inner">
        <Link href={getHomeHref(role)} className="cw-brand">
          <div className="cw-logo-box">
            <Image
              src="/cw-logo.jpg"
              alt="Cleaning World Logo"
              width={120}
              height={60}
              className="cw-logo"
              priority
            />
          </div>

          <div className="cw-brand-text">
            <h1>Cleaning World</h1>
            <p>Operations & Quality Management System</p>
          </div>
        </Link>

        {ready && navItems.length > 0 ? (
          <nav className="cw-nav" aria-label="Main navigation">
            {role === "admin" ? (
              <Link
                href="/notifications"
                className="cw-nav-button"
                aria-label={
                  notificationCount > 0
                    ? `${notificationCount} new notifications`
                    : "Notifications"
                }
              >
                <span>🔔</span>
                <span>Notifications</span>
                {notificationCount > 0 ? (
                  <span
                    style={{
                      marginLeft: "6px",
                      borderRadius: "999px",
                      background: "#dc2626",
                      color: "white",
                      padding: "2px 7px",
                      fontSize: "12px",
                      fontWeight: 900,
                    }}
                  >
                    {notificationCount}
                  </span>
                ) : null}
              </Link>
            ) : null}

            <Link
              href="/help"
              className="cw-nav-button"
              aria-label="Help and app instructions"
              title="Help and app instructions"
            >
              <span>❔</span>
              <span>Help</span>
            </Link>

            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="cw-nav-button">
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}