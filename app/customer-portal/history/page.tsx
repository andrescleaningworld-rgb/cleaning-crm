"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCustomerHistory, getCustomerRequests } from "../../lib/backend";

type Visit = {
  type?: string;
  date?: string;
  status?: string;
  notes?: string;
};

type CustomerRequest = {
  type?: string;
  issue?: string;
  details?: string;
  status?: string;
  date?: string;
};

export default function CustomerHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Visit[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);

  useEffect(() => {
    const storedId = localStorage.getItem("cwCustomerId");
    if (!storedId) {
      router.replace("/customer-portal/login");
      return;
    }

    async function loadAll() {
      try {
        const [h, r] = await Promise.all([
          getCustomerHistory(storedId!),
          getCustomerRequests(storedId!),
        ]);
        setHistory(h as Visit[]);
        setRequests(r as CustomerRequest[]);
      } catch {
        // Show empty state
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [router]);

  function statusClass(status: string | undefined) {
    const s = (status || "").toLowerCase();
    if (s.includes("complet") || s.includes("resolved") || s.includes("closed"))
      return "bg-emerald-100 text-emerald-700";
    if (s.includes("open") || s.includes("pending"))
      return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-600";
  }

  return (
    <div className="mx-auto max-w-4xl px-2 py-4 sm:py-6">
      <Link
        href="/customer-portal"
        className="text-sm font-semibold text-purple-700 hover:underline"
      >
        ← Back to My Account
      </Link>

      <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
        Full History
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        All past service visits, requests, and complaints on your account.
      </p>

      {loading ? (
        <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Loading...</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {/* Service visits */}
          <section>
            <h2 className="mb-3 text-lg font-black text-slate-950">
              Service Visits
            </h2>
            {history.length > 0 ? (
              <div className="divide-y divide-slate-100 rounded-3xl border border-slate-100 bg-white shadow-sm">
                {history.map((item, i) => (
                  <div key={i} className="flex items-start justify-between p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {item.type || "Service Visit"}
                      </p>
                      {item.date && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.date}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-1 text-xs text-slate-600">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <span
                      className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusClass(
                        item.status
                      )}`}
                    >
                      {item.status || "Completed"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No service visits on record yet.
              </p>
            )}
          </section>

          {/* Requests and complaints */}
          <section>
            <h2 className="mb-3 text-lg font-black text-slate-950">
              Requests & Complaints
            </h2>
            {requests.length > 0 ? (
              <div className="divide-y divide-slate-100 rounded-3xl border border-slate-100 bg-white shadow-sm">
                {requests.map((req, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-bold text-slate-900">
                        {req.type || (req.issue ? "Complaint" : "Request")}
                      </p>
                      <span
                        className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusClass(
                          req.status
                        )}`}
                      >
                        {req.status || "Pending"}
                      </span>
                    </div>
                    {(req.details || req.issue) && (
                      <p className="mt-1 text-xs text-slate-600">
                        {String(req.details || req.issue).slice(0, 120)}
                      </p>
                    )}
                    {req.date && (
                      <p className="mt-1 text-xs text-slate-400">{req.date}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No requests or complaints on record.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
