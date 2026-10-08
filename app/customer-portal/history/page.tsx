"use client";

import Link from "next/link";
import { StatusPill, type StatusKind } from "@/app/ui";
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

  function statusKind(status: string | undefined): StatusKind {
    const s = (status || "").toLowerCase();
    if (s.includes("complet") || s.includes("resolved") || s.includes("closed")) return "done";
    if (s.includes("open") || s.includes("pending")) return "waiting";
    return "off";
  }

  return (
    <div className="ui-screen">
      <Link
        href="/customer-portal"
        className="ui-link"
      >
        ← Back to My Account
      </Link>

      <h1 className="ui-screen-title">
        Full History
      </h1>
      <p className="ui-muted">
        All past service visits, requests, and complaints on your account.
      </p>

      {loading ? (
        <div className="ui-card ui-stack">
          <p className="ui-muted">Loading...</p>
        </div>
      ) : (
        <div className="ui-stack">
          {/* Service visits */}
          <section>
            <h2 className="ui-card-title">
              Service Visits
            </h2>
            {history.length > 0 ? (
              <div className="ui-card ui-list-plain">
                {history.map((item, i) => (
                  <div key={i} className="ui-card-row">
                    <div>
                      <p className="ui-strong">
                        {item.type || "Service Visit"}
                      </p>
                      {item.date && (
                        <p className="ui-muted">
                          {item.date}
                        </p>
                      )}
                      {item.notes && (
                        <p className="ui-muted">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <StatusPill kind={statusKind(item.status)}>{item.status || "Completed"}</StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ui-muted">
                No service visits on record yet.
              </p>
            )}
          </section>

          {/* Requests and complaints */}
          <section>
            <h2 className="ui-card-title">
              Requests & Complaints
            </h2>
            {requests.length > 0 ? (
              <div className="ui-card ui-list-plain">
                {requests.map((req, i) => (
                  <div key={i}>
                    <div className="ui-card-row">
                      <p className="ui-strong">
                        {req.type || (req.issue ? "Complaint" : "Request")}
                      </p>
                      <StatusPill kind={statusKind(req.status)}>{req.status || "Pending"}</StatusPill>
                    </div>
                    {(req.details || req.issue) && (
                      <p className="ui-muted">
                        {String(req.details || req.issue).slice(0, 120)}
                      </p>
                    )}
                    {req.date && (
                      <p className="ui-muted">{req.date}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="ui-muted">
                No requests or complaints on record.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
