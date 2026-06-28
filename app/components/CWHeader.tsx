"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type UserRole = "admin" | "subcontractor" | "customer" | null;

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
  { href: "/subcontractor-portal", label: "Home" },
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

  useEffect(() => {
    setMounted(true);
    setRole(getStoredRole());

    const handleStorageChange = () => {
      setRole(getStoredRole());
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

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

  const navItems = useMemo(() => {
    if (!mounted) return [];
    if (role === "admin") return adminNavItems;
    if (role === "subcontractor") return subcontractorNavItems;
    if (role === "customer") return customerNavItems;
    return [];
  }, [role, mounted]);

  const isLoginPage = pathname === "/login";
  const showNav = !isLoginPage && navItems.length > 0;

  return (
    <header className="w-full bg-slate-50 px-4 py-8 sm:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-blue-900 via-blue-700 to-sky-500 px-6 py-6 sm:py-4 shadow-xl">
          {!isLoginPage && (
            <Link
              href="/help"
              title="Help / Tutorial"
              className="absolute right-6 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-white/15 text-lg font-bold text-white shadow-md transition hover:bg-white/25"
            >
              ?
            </Link>
          )}

          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-5 pr-16">
              <div className="flex h-20 w-36 sm:h-14 sm:w-24 items-center justify-center rounded-2xl bg-white p-3 shadow-md">
                <Image
                  src="/logo-CW-single-phone-optimized.png"
                  alt="Cleaning World"
                  width={130}
                  height={70}
                  priority
                  unoptimized
                  className="max-h-full w-auto object-contain"
                />
              </div>

              <div>
                <h1 className="text-3xl sm:text-2xl font-extrabold tracking-tight text-white drop-shadow-sm">
                  Cleaning World
                </h1>
                <p className="mt-1 text-sm sm:text-xs font-semibold text-white">
                  Service Portal &amp; Operations
                </p>
              </div>
            </div>

            {showNav && (
              <nav className="flex flex-wrap items-center gap-3">
                {role === "admin" && (
                  <Link
                    href="/notifications"
                    className={`rounded-full border px-4 py-2 text-sm font-bold shadow-sm transition ${
                      pathname === "/notifications"
                        ? "border-white bg-white text-blue-800"
                        : "border-white/25 bg-white/15 text-white hover:bg-white/25"
                    }`}
                  >
                    🔔 Notifications
                    {newNotificationCount > 0 && (
                      <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-extrabold text-white">
                        {newNotificationCount}
                      </span>
                    )}
                  </Link>
                )}

                {navItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-full border px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold shadow-sm transition ${
                        isActive
                          ? "border-white bg-white text-blue-800"
                          : "border-white/25 bg-white/15 text-white hover:bg-white/25"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}