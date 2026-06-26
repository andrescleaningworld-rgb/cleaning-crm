"use client";

import Link from "next/link";
import { useState } from "react";

type UserRole = "customer" | null;

export default function CustomerPortalPage() {
  const [role] = useState<UserRole>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem("cwRole");
    if (stored === "customer") return "customer";
    // Demo: auto set customer role on first visit to portal
    window.localStorage.setItem("cwRole", "customer");
    return "customer";
  });

  const accountInfo = {
    accountName: "Your Account",
    serviceFrequency: "Weekly",
    nextService: "2026-07-02",
    status: "Active",
  };

  if (!role) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p>Loading customer portal...</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-bold uppercase tracking-widest text-purple-600">
          Cleaning World
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Customer Portal
        </h1>
        <p className="mt-2 text-gray-600">
          Welcome! Manage your cleaning services, report issues, and request changes.
        </p>
      </div>

      {/* Account Overview - intuitive summary */}
      <div className="mb-8 rounded-3xl border border-purple-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Your Service Overview</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-sm text-gray-500">Account</div>
            <div className="font-semibold">{accountInfo.accountName}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Service Frequency</div>
            <div className="font-semibold">{accountInfo.serviceFrequency}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Next Scheduled Service</div>
            <div className="font-semibold">{accountInfo.nextService}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Status</div>
            <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
              {accountInfo.status}
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          This is a preview. Real data will come from your account records once connected.
        </p>
      </div>

      {/* Main actions - the features the user mentioned */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/customer-portal/requests"
          className="group rounded-3xl border border-purple-200 bg-white p-6 shadow-sm transition hover:border-purple-400 hover:shadow-md"
        >
          <div className="mb-3 text-3xl">🛠️</div>
          <h3 className="text-lg font-bold group-hover:text-purple-700">Request Specialty Services</h3>
          <p className="mt-2 text-sm text-gray-600">
            Need floor stripping, carpet cleaning, or other extra services? Submit a request here.
          </p>
        </Link>

        <Link
          href="/customer-portal/complaints"
          className="group rounded-3xl border border-purple-200 bg-white p-6 shadow-sm transition hover:border-purple-400 hover:shadow-md"
        >
          <div className="mb-3 text-3xl">⚠️</div>
          <h3 className="text-lg font-bold group-hover:text-purple-700">Report a Complaint or Issue</h3>
          <p className="mt-2 text-sm text-gray-600">
            Something not right with the cleaning? Let us know quickly and we&apos;ll follow up.
          </p>
        </Link>

        <Link
          href="/customer-portal/requests"
          className="group rounded-3xl border border-purple-200 bg-white p-6 shadow-sm transition hover:border-purple-400 hover:shadow-md"
        >
          <div className="mb-3 text-3xl">📅</div>
          <h3 className="text-lg font-bold group-hover:text-purple-700">Request Service or Date Changes</h3>
          <p className="mt-2 text-sm text-gray-600">
            Need to adjust your cleaning day, frequency, or pause service temporarily?
          </p>
        </Link>

        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6 text-gray-500">
          <div className="mb-3 text-3xl">📋</div>
          <h3 className="text-lg font-bold">View Service History</h3>
          <p className="mt-2 text-sm">
            Coming soon — see recent visits, reports, and completed work.
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6 text-gray-500">
          <div className="mb-3 text-3xl">📞</div>
          <h3 className="text-lg font-bold">Contact Your Manager</h3>
          <p className="mt-2 text-sm">
            Direct contact options coming soon. For now use the request forms above.
          </p>
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-gray-500">
        This portal is being improved to be more intuitive as we prepare to move to a dedicated backend.
        <br />
        Your feedback helps! Use the forms above to simulate requests.
      </div>
    </main>
  );
}
