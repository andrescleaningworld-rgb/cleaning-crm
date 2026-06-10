"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Account = {
  id?: string;
  rowNumber?: number;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  manager?: string;
  subcontractor?: string;
  status?: string;
  accountHealth?: string;
  monthlyRevenue?: string;
  subcontractorPay?: string;
  grossMargin?: string;
  grossMarginPercent?: string;
  hasKey?: string;
  alarmCode?: string;
  notes?: string;
};

function normalizeValue(value: string | number | undefined | null) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/%20/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function moneyToNumber(value: string | undefined) {
  if (!value) return 0;

  const cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatMoney(value: string | undefined) {
  const number = moneyToNumber(value);

  if (!number) return value || "N/A";

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatCalculatedMoney(value: number) {
  if (!value) return "N/A";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getStatusClass(status: string | undefined) {
  const clean = String(status || "").toLowerCase();

  if (clean.includes("active")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (
    clean.includes("cancel") ||
    clean.includes("inactive") ||
    clean.includes("lost")
  ) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (clean.includes("pause")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getHealthClass(health: string | undefined) {
  const clean = String(health || "").toLowerCase();

  if (clean.includes("high risk")) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (clean.includes("attention")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (
    clean.includes("stable") ||
    clean.includes("good") ||
    clean.includes("excellent")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function AccountDetailPage() {
  const params = useParams();
  const rawAccountIdFromUrl = String(params?.id || "");
  const decodedAccountIdFromUrl = decodeURIComponent(rawAccountIdFromUrl);
  const normalizedUrlValue = normalizeValue(decodedAccountIdFromUrl);

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAccount() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not load accounts.");
        }

        const accounts: Account[] = data.accounts || data.data || [];

        const foundAccount = accounts.find((item) => {
          const itemId = normalizeValue(item.id);
          const itemRowNumber = normalizeValue(item.rowNumber);
          const itemName = normalizeValue(item.accountName);

          return (
            itemId === normalizedUrlValue ||
            itemRowNumber === normalizedUrlValue ||
            itemName === normalizedUrlValue ||
            String(item.id || "") === decodedAccountIdFromUrl ||
            String(item.rowNumber || "") === decodedAccountIdFromUrl ||
            String(item.accountName || "") === decodedAccountIdFromUrl
          );
        });

        if (!foundAccount) {
          console.log("Account URL value:", decodedAccountIdFromUrl);
          console.log("Available accounts:", accounts);
          throw new Error("Could not find this account.");
        }

        setAccount(foundAccount);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong loading this account."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAccount();
  }, [decodedAccountIdFromUrl, normalizedUrlValue]);

  const accountAddress = useMemo(() => {
    if (!account) return "";

    return [account.address, account.city, account.state, account.zip]
      .filter(Boolean)
      .join(", ");
  }, [account]);

  const monthlyRevenueNumber = moneyToNumber(account?.monthlyRevenue);
  const subcontractorPayNumber = moneyToNumber(account?.subcontractorPay);
  const estimatedGrossMargin = monthlyRevenueNumber - subcontractorPayNumber;

  const accountNameForUrl = encodeURIComponent(account?.accountName || "");
  const accountIdForUrl = encodeURIComponent(
    String(account?.id || account?.rowNumber || account?.accountName || rawAccountIdFromUrl)
  );

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          Loading account...
        </p>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <Link
          href="/accounts"
          className="text-sm font-bold text-blue-800 hover:underline"
        >
          ← Back to Accounts
        </Link>

        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error || "Could not find this account."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/accounts"
          className="text-sm font-bold text-blue-800 hover:underline"
        >
          ← Back to Accounts
        </Link>
      </div>

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="bg-gradient-to-r from-blue-950 via-blue-800 to-sky-600 p-6 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-100">
                Cleaning World Account
              </p>

              <h1 className="mt-2 text-4xl font-black tracking-tight">
                {account.accountName || "Unnamed Account"}
              </h1>

              {accountAddress ? (
                <p className="mt-3 max-w-3xl text-sm font-medium text-blue-100">
                  {accountAddress}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                    account.status
                  )}`}
                >
                  {account.status || "No Status"}
                </span>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${getHealthClass(
                    account.accountHealth
                  )}`}
                >
                  {account.accountHealth || "No Health Status"}
                </span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[380px]">
              <Link
                href={`/sales?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
                className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-blue-950 shadow-sm hover:bg-blue-50"
              >
                Add Sale
              </Link>

              <Link
                href={`/visits?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
                className="rounded-2xl bg-blue-100 px-4 py-3 text-center text-sm font-black text-blue-950 shadow-sm hover:bg-white"
              >
                Add Visit
              </Link>

              <Link
                href={`/complaints?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
                className="rounded-2xl bg-red-100 px-4 py-3 text-center text-sm font-black text-red-900 shadow-sm hover:bg-white"
              >
                Add Complaint
              </Link>

              <Link
                href={`/account-updates?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
                className="rounded-2xl bg-sky-100 px-4 py-3 text-center text-sm font-black text-blue-950 shadow-sm hover:bg-white"
              >
                Add Update
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-blue-100 bg-blue-50/70 p-5 md:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">
              Manager
            </p>
            <p className="mt-2 text-xl font-black text-slate-950">
              {account.manager || "Unassigned"}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">
              Subcontractor
            </p>
            <p className="mt-2 text-xl font-black text-slate-950">
              {account.subcontractor || "Unassigned"}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">
              Monthly Revenue
            </p>
            <p className="mt-2 text-xl font-black text-slate-950">
              {formatMoney(account.monthlyRevenue)}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">
              Est. Gross Margin
            </p>
            <p className="mt-2 text-xl font-black text-slate-950">
              {estimatedGrossMargin
                ? formatCalculatedMoney(estimatedGrossMargin)
                : account.grossMargin || "N/A"}
            </p>

            {account.grossMarginPercent ? (
              <p className="mt-1 text-xs font-bold text-slate-500">
                {account.grossMarginPercent}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-950">
                Account Snapshot
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Main operational details for this account.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Account ID
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {account.id || account.rowNumber || "N/A"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Subcontractor Pay
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {formatMoney(account.subcontractorPay)}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Has Key
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {account.hasKey || "N/A"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Alarm Code
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {account.alarmCode || "N/A"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Address
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {accountAddress || "N/A"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Notes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Internal account notes.
            </p>

            <div className="mt-5 rounded-2xl bg-blue-50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {account.notes || "No notes added for this account yet."}
              </p>
            </div>
          </section>
        </div>

        <section className="border-t border-slate-200 bg-slate-50 p-6">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              Quick Actions
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Add activity or jump into account reports.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/sales?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
              className="rounded-2xl border border-blue-200 bg-white px-4 py-2 text-sm font-black text-blue-900 shadow-sm hover:bg-blue-50"
            >
              Add Sale
            </Link>

            <Link
              href={`/visits?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
              className="rounded-2xl border border-blue-200 bg-white px-4 py-2 text-sm font-black text-blue-900 shadow-sm hover:bg-blue-50"
            >
              Add Visit
            </Link>

            <Link
              href={`/complaints?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
              className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-black text-red-800 shadow-sm hover:bg-red-50"
            >
              Add Complaint
            </Link>

            <Link
              href={`/account-updates?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
              className="rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-black text-blue-900 shadow-sm hover:bg-sky-50"
            >
              Add Update
            </Link>

            <Link
              href={`/sales?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-100"
            >
              View Account Sales
            </Link>

            <Link
              href="/sales"
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-100"
            >
              Full Sales & Commissions
            </Link>
          </div>
        </section>
      </section>
    </div>
  );
}