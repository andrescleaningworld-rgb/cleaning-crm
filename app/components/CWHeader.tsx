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

export default function CWHeader() {
  const pathname = usePathname();

  const [role, setRole] = useState<UserRole>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const adminLoggedIn =
      localStorage.getItem("cwAdminLoggedIn") === "true" ||
      localStorage.getItem("isAdminLoggedIn") === "true" ||
      localStorage.getItem("adminLoggedIn") === "true";

    const subLoggedIn =
      localStorage.getItem("cwSubcontractorLoggedIn") === "true" ||
      localStorage.getItem("subcontractorLoggedIn") === "true" ||
      Boolean(localStorage.getItem("cwSubcontractorEmail"));

    if (adminLoggedIn) {
      setRole("admin");
    } else if (subLoggedIn) {
      setRole("subcontractor");
    } else {
      setRole(null);
    }

    setReady(true);
  }, [pathname]);

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

        {ready && role && (
          <nav className="cw-nav" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="cw-nav-button">
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}