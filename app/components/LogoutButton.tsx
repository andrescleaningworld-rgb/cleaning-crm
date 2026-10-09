"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

// The sidebar passes its own look (className) and content (icon + word).
export default function LogoutButton({ className, title, children }: { className?: string; title?: string; children?: ReactNode } = {}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    // Clear stale per-device identity flags so a shared/kiosk device doesn't
    // leak the previous person's identity into the next login.
    for (const key of ["cwRole", "cwUserRole", "userRole", "cwAdminLoggedIn", "isAdminLoggedIn", "cwManagerId"]) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore — localStorage may be unavailable (private browsing, etc.)
      }
    }
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      title={title}
      className={
        className ??
        "inline-flex min-h-[48px] items-center rounded-full border border-red-300/50 bg-red-500/20 px-4 py-2 text-base font-bold text-white shadow-sm transition hover:bg-red-500/30"
      }
    >
      {children ?? "Logout"}
    </button>
  );
}
