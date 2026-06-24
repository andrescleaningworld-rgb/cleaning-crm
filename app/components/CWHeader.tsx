"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type UserRole = "admin" | "subcontractor" | null;

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

  // Important fallback:
  // If the user is already inside an admin page, proxy/login already allowed them.
  // So show the admin navigation instead of leaving the header blank.
  return "admin";
}

export default function CWHeader() {
  const pathname = usePathname();

  const [role, setRole] = useState<UserRole>(null);
  const [ready, setReady] = useState(false);

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

  const navItems = useMemo(() => {
    if (role === "admin") return adminNavItems;
    if (role === "subcontractor") return subcontractorNavItems;
    return [];
  }, [role]);

  return (
    <header className="cw-header">
      <div className="cw-header-inner">
        <Link href={role ? "/" : "/login"} className="cw-brand">
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