"use client";

import Link from "next/link";
import { StatusPill, type StatusKind } from "@/app/ui";
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
  estimatedMonthlyTotal: string;
  lastInvoiceDate: string;
  managerName: string;
  managerPhone: string;
};

function formatCurrency(raw: string): string {
  if (!raw) return "—";
  const num = parseFloat(raw.replace(/[$,\s]/g, ""));
  if (isNaN(num)) return raw;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

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
  const kind: StatusKind = clean.includes("active")
    ? "done"
    : clean.includes("cancel") || clean.includes("lost")
    ? "needs-you"
    : clean.includes("pause") || clean.includes("hold")
    ? "waiting"
    : "off";

  return <StatusPill kind={kind}>{status}</StatusPill>;
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
            estimatedMonthlyTotal: String(acc.estimatedMonthlyTotal || ""),
            lastInvoiceDate: String(acc.lastInvoiceDate || ""),
            managerName: String(acc.managerName || ""),
            managerPhone: String(acc.managerPhone || ""),
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
      <div className="ui-screen">
        <div className="ui-card ui-stack">
          <p className="ui-muted">
            Loading your account...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-screen">
      {/* Page header */}
      <div className="ui-card-row">
        <div>
          <p className="ui-strong">
            Cleaning World
          </p>
          <h1 className="ui-screen-title">
            {customerName || account?.accountName || "My Account"}
          </h1>
          {account?.address && (
            <p className="ui-muted">{account.address}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="ui-btn ui-btn-second shrink-0"
        >
          Sign Out
        </button>
      </div>

      {/* Status row */}
      {account && (
        <div className="ui-stats">
          <div className="ui-stat">
            <p className="ui-strong">
              Status
            </p>
            <div>
              <StatusBadge status={account.status} />
            </div>
          </div>

          {account.serviceFrequency ? (
            <div className="ui-stat">
              <p className="ui-muted">
                Service Frequency
              </p>
              <p className="ui-strong">
                {account.serviceFrequency}
              </p>
            </div>
          ) : null}

          {openComplaints.length > 0 ? (
            <div className="ui-stat">
              <p className="ui-strong">
                Open Issues
              </p>
              <p className="ui-stat-value">
                {openComplaints.length}
              </p>
            </div>
          ) : null}

          {pendingRequests.length > 0 ? (
            <div className="ui-stat">
              <p className="ui-strong">
                Pending Requests
              </p>
              <p className="ui-stat-value">
                {pendingRequests.length}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Quick actions */}
      <div className="ui-two">
        <Link
          href="/customer-portal/complaints"
          className="ui-card ui-stack"
        >
          <span aria-hidden="true">⚠️</span>
          <h3 className="ui-card-title">
            Report an Issue
          </h3>
          <p className="ui-muted">
            Something wasn&apos;t cleaned right? Let us know and we&apos;ll
            follow up quickly.
          </p>
        </Link>

        <Link
          href="/customer-portal/requests"
          className="ui-card ui-stack"
        >
          <span>📋</span>
          <h3 className="ui-card-title">
            Submit a Request
          </h3>
          <p className="ui-muted">
            Deep clean, schedule change, frequency adjustment, or anything else.
          </p>
        </Link>
      </div>

      {/* Recent visits */}
      <div className="ui-card ui-stack">
        <div className="ui-card-row">
          <h2 className="ui-card-title">
            Recent Service Visits
          </h2>
          <Link
            href="/customer-portal/history"
            className="ui-link"
          >
            View full history →
          </Link>
        </div>

        {recentVisits.length > 0 ? (
          <div className="ui-stack">
            {recentVisits.map((visit, i) => (
              <div
                key={i}
                className="ui-stat ui-card-row"
              >
                <div>
                  <p className="ui-strong">
                    {visit.type || "Service Visit"}
                  </p>
                  {visit.date && (
                    <p className="ui-muted">{visit.date}</p>
                  )}
                  {visit.notes && (
                    <p className="ui-muted">{visit.notes}</p>
                  )}
                </div>
                <StatusPill kind="done">{visit.status || "Completed"}</StatusPill>
              </div>
            ))}
          </div>
        ) : (
          <p className="ui-muted">No service visits on record yet.</p>
        )}
      </div>

      {/* Financials & Contact */}
      <div className="ui-two">
        <div className="ui-card ui-stack">
          <h2 className="ui-card-title">
            Financials
          </h2>
          <p className="ui-stat-value">
            {formatCurrency(account?.estimatedMonthlyTotal || "")}
            <span className="ui-muted">
              / month
            </span>
          </p>
          <p className="ui-muted">
            Includes 6.625% NJ Sales Tax
          </p>
          {account?.lastInvoiceDate ? (
            <p className="ui-muted">
              <span className="ui-strong">Last Invoice:</span>{" "}
              {account.lastInvoiceDate}
            </p>
          ) : null}
        </div>

        <div className="ui-card ui-stack">
          <h2 className="ui-card-title">Contact</h2>

          {account?.managerName ? (
            <div>
              <p className="ui-strong">
                {account.managerName}
              </p>
              {account.managerPhone ? (
                <a
                  href={`tel:${account.managerPhone}`}
                  className="ui-link"
                >
                  {account.managerPhone}
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="ui-stack">
            <p className="ui-muted">
              <span className="ui-strong">
                General Inquiries:
              </span>{" "}
              <a
                href="mailto:info@cleaningworldinc.com"
                className="ui-link"
              >
                info@cleaningworldinc.com
              </a>
            </p>
            <p className="ui-muted">
              <span className="ui-strong">
                Account Services:
              </span>{" "}
              <a
                href="mailto:crm@cleaningworldinc.com"
                className="ui-link"
              >
                crm@cleaningworldinc.com
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Open complaints */}
      {openComplaints.length > 0 && (
        <div className="ui-card ui-stack">
          <h2 className="ui-card-title">
            Open Issues
          </h2>
          <div className="ui-stack">
            {openComplaints.map((c, i) => (
              <div
                key={i}
                className="ui-stat"
              >
                <p className="ui-strong">
                  {String(c.issue || "Issue reported").slice(0, 100)}
                </p>
                <div className="ui-actions-row">
                  <span className="ui-strong">
                    {c.status || "Open"}
                  </span>
                  {c.date && (
                    <span className="ui-muted">· {c.date}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="ui-card ui-stack">
          <h2 className="ui-card-title">
            Pending Requests
          </h2>
          <div className="ui-stack">
            {pendingRequests.map((r, i) => (
              <div
                key={i}
                className="ui-stat"
              >
                <p className="ui-strong">
                  {r.type || "Request"}
                </p>
                {r.details && (
                  <p className="ui-muted">
                    {String(r.details).slice(0, 100)}
                  </p>
                )}
                <div className="ui-actions-row">
                  <span className="ui-strong">
                    {r.status || "Pending"}
                  </span>
                  {r.date && (
                    <span className="ui-muted">· {r.date}</span>
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
