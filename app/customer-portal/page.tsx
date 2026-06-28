"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAccountsForCustomer,
  getCustomerHistory,
  getCustomerRequests,
} from "../lib/backend";

type AccountInfo = {
  accountName: string;
  address: string;
  serviceFrequency: string;
  status: string;
  manager: string;
};

type Visit = {
  date?: string;
  type?: string;
  status?: string;
  notes?: string;
};

type CustomerRequest = {
  type?: string;
  details?: string;
  issue?: string;
  status?: string;
  date?: string;
};

function StatusBadge({ status }: { status: string }) {
  const clean = status.toLowerCase();
  const cls = clean.includes("active")
    ? "bg-emerald-100 text-emerald-700"
    : clean.includes("cancel") || clean.includes("lost")
    ? "bg-red-100 text-red-700"
    : clean.includes("pause") || clean.includes("hold")
    ? "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${cls}`}>
      {status}
    </span>
  );
}

export default function CustomerPortalPage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [recentVisits, setRecentVisits] = useState<Visit[]>([]);
  const [openComplaints, setOpenComplaints] = useState<CustomerRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<CustomerRequest[]>([]);

  useEffect(() => {
    const storedId = localStorage.getItem("cwCustomerId");
    const storedName = localStorage.getItem("cwCustomerName");

    if (!storedId) {
      router.replace("/customer-portal/login");
      return;
    }

    setCustomerId(storedId);
    setCustomerName(storedName || "");
    localStorage.setItem("cwRole", "customer");

    async function loadData() {
      try {
        const [accounts, history, allRequests] = await Promise.all([
          getAccountsForCustomer(storedId!),
          getCustomerHistory(storedId!),
          getCustomerRequests(storedId!),
        ]);

        if (accounts.length > 0) {
          const acc = accounts[0] as Record<string, unknown>;
          const addressParts = [acc.address, acc.city, acc.state, acc.zip]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean);
          setAccount({
            accountName:
              String(acc.accountName || acc.name || storedName || "Your Account"),
            address: addressParts.join(", ") || String(acc.address || ""),
            serviceFrequency: String(
              acc.frequency ||
              acc.serviceFrequency ||
              acc.cleaningFrequency ||
              ""
            ),
            status: String(acc.status || acc.accountStatus || "Active"),
            manager: String(acc.manager || acc.accountManager || ""),
          });
        }

        setRecentVisits((history as Visit[]).slice(0, 3));

        const complaints = (allRequests as CustomerRequest[]).filter(
          (r) =>
            r.type?.toLowerCase().includes("complaint") ||
            Boolean(r.issue)
        );
        const requests = (allRequests as CustomerRequest[]).filter(
          (r) =>
            !r.type?.toLowerCase().includes("complaint") &&
            !r.issue
        );

        setOpenComplaints(
          complaints.filter(
            (c) =>
              (c.status || "Open") !== "Resolved" &&
              (c.status || "Open") !== "Closed"
          )
        );
        setPendingRequests(
          requests.filter((r) => (r.status || "Pending") !== "Completed")
        );
      } catch {
        // Data couldn't load — user is still authenticated
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  function handleSignOut() {
    localStorage.removeItem("cwCustomerId");
    localStorage.removeItem("cwCustomerName");
    localStorage.setItem("cwRole", "");
    router.push("/customer-portal/login");
  }

  if (!customerId) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-2 py-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Loading your account...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-2 py-4 sm:py-6">
      {/* Page header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-700">
            Cleaning World
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            {customerName || account?.accountName || "My Account"}
          </h1>
          {account?.address && (
            <p className="mt-1 text-sm text-slate-500">{account.address}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          Sign Out
        </button>
      </div>

      {/* Status row */}
      {account && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-purple-700">
              Status
            </p>
            <div className="mt-2">
              <StatusBadge status={account.status} />
            </div>
          </div>

          {account.serviceFrequency ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Service Frequency
              </p>
              <p className="mt-2 text-sm font-black text-slate-950">
                {account.serviceFrequency}
              </p>
            </div>
          ) : null}

          {openComplaints.length > 0 ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-amber-700">
                Open Issues
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {openComplaints.length}
              </p>
            </div>
          ) : null}

          {pendingRequests.length > 0 ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-blue-700">
                Pending Requests
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {pendingRequests.length}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Quick actions */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Link
          href="/customer-portal/complaints"
          className="group rounded-3xl border border-red-100 bg-white p-5 shadow-sm transition hover:border-red-300 hover:shadow-md"
        >
          <span className="text-2xl">⚠️</span>
          <h3 className="mt-2 text-base font-black text-slate-950 group-hover:text-red-700">
            Report an Issue
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Something wasn&apos;t cleaned right? Let us know and we&apos;ll
            follow up quickly.
          </p>
        </Link>

        <Link
          href="/customer-portal/requests"
          className="group rounded-3xl border border-purple-100 bg-white p-5 shadow-sm transition hover:border-purple-300 hover:shadow-md"
        >
          <span className="text-2xl">📋</span>
          <h3 className="mt-2 text-base font-black text-slate-950 group-hover:text-purple-700">
            Submit a Request
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Deep clean, schedule change, frequency adjustment, or anything else.
          </p>
        </Link>
      </div>

      {/* Recent visits */}
      <div className="mb-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">
            Recent Service Visits
          </h2>
          <Link
            href="/customer-portal/history"
            className="text-xs font-bold text-purple-700 hover:underline"
          >
            View full history →
          </Link>
        </div>

        {recentVisits.length > 0 ? (
          <div className="space-y-3">
            {recentVisits.map((visit, i) => (
              <div
                key={i}
                className="flex items-start justify-between rounded-2xl border border-slate-100 p-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {visit.type || "Service Visit"}
                  </p>
                  {visit.date && (
                    <p className="mt-0.5 text-xs text-slate-500">{visit.date}</p>
                  )}
                  {visit.notes && (
                    <p className="mt-1 text-xs text-slate-600">{visit.notes}</p>
                  )}
                </div>
                <span className="ml-3 shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                  {visit.status || "Completed"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No service visits on record yet.</p>
        )}
      </div>

      {/* Open complaints */}
      {openComplaints.length > 0 && (
        <div className="mb-4 rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <h2 className="mb-3 text-base font-black text-amber-900">
            Open Issues
          </h2>
          <div className="space-y-2">
            {openComplaints.map((c, i) => (
              <div
                key={i}
                className="rounded-2xl border border-amber-200 bg-white p-3"
              >
                <p className="text-sm font-bold text-slate-900">
                  {String(c.issue || "Issue reported").slice(0, 100)}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-700">
                    {c.status || "Open"}
                  </span>
                  {c.date && (
                    <span className="text-xs text-slate-400">· {c.date}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-4 rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="mb-3 text-base font-black text-blue-900">
            Pending Requests
          </h2>
          <div className="space-y-2">
            {pendingRequests.map((r, i) => (
              <div
                key={i}
                className="rounded-2xl border border-blue-200 bg-white p-3"
              >
                <p className="text-sm font-bold text-slate-900">
                  {r.type || "Request"}
                </p>
                {r.details && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    {String(r.details).slice(0, 100)}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs font-semibold text-blue-700">
                    {r.status || "Pending"}
                  </span>
                  {r.date && (
                    <span className="text-xs text-slate-400">· {r.date}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
