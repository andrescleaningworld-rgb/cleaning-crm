"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type Account = {
  id?: string;
  accountId?: string;
  rowNumber?: number;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  manager?: string;
  subcontractor?: string;
  status?: string;
  cancelledDate?: string;
  accountHealth?: string;
  monthlyRevenue?: string;
  monthlySubcontractorPay?: string;
  subcontractorPay?: string;
  grossMargin?: string;
  grossMarginPercent?: string;
  hasKey?: string;
  alarmCode?: string;
  keyAlarmAccessInfo?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  serviceType?: string;
  frequency?: string;
  cleaningDays?: string;
  scopeOfWork?: string;
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

function formatCurrency(value: string | undefined) {
  const number = moneyToNumber(value);

  if (!number) return "$0";

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function EditAccountPage() {
  const params = useParams();
  const rawAccountIdFromUrl = String(params?.id || "");
  const decodedAccountIdFromUrl = decodeURIComponent(rawAccountIdFromUrl);
  const normalizedUrlValue = normalizeValue(decodedAccountIdFromUrl);

  const [formData, setFormData] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

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
          const itemId = normalizeValue(item.accountId || item.id);
          const itemRowNumber = normalizeValue(item.rowNumber);
          const itemName = normalizeValue(item.accountName);

          return (
            itemId === normalizedUrlValue ||
            itemRowNumber === normalizedUrlValue ||
            itemName === normalizedUrlValue ||
            String(item.accountId || item.id || "") === decodedAccountIdFromUrl ||
            String(item.rowNumber || "") === decodedAccountIdFromUrl ||
            String(item.accountName || "") === decodedAccountIdFromUrl
          );
        });

        if (!foundAccount) {
          throw new Error(
            "This account does not exist or the account link is incorrect."
          );
        }

        setFormData(foundAccount);
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

  const accountIdForUrl = encodeURIComponent(
    String(
      formData?.accountId ||
        formData?.id ||
        formData?.rowNumber ||
        formData?.accountName ||
        rawAccountIdFromUrl
    )
  );

  const grossMargin = useMemo(() => {
    const revenue = moneyToNumber(formData?.monthlyRevenue);
    const subPay = moneyToNumber(
      formData?.subcontractorPay || formData?.monthlySubcontractorPay
    );

    return revenue - subPay;
  }, [formData]);

  const grossMarginPercent = useMemo(() => {
    const revenue = moneyToNumber(formData?.monthlyRevenue);

    if (!revenue) return 0;

    return (grossMargin / revenue) * 100;
  }, [formData, grossMargin]);

  function updateField(field: keyof Account, value: string) {
    setFormData((current) => {
      if (!current) return current;

      return {
        ...current,
        [field]: value,
      };
    });

    setSavedMessage("");
    setSaveError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formData) {
      setSaveError("No account data loaded. Please refresh and try again.");
      return;
    }

    try {
      setSaving(true);
      setSaveError("");
      setSavedMessage("Saving changes...");

      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateAccount",
          account: {
            ...formData,
            id: formData.id || formData.accountId,
            accountId: formData.accountId || formData.id,
            rowNumber: formData.rowNumber,
            grossMargin: String(grossMargin),
            grossMarginPercent: grossMarginPercent.toFixed(1),
          },
        }),
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("API did not return valid JSON while updating account.");
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not update account.");
      }

      setSavedMessage("Account updated successfully.");
      setSaveError("");
    } catch (err) {
      setSavedMessage("");
      setSaveError(
        err instanceof Error
          ? err.message
          : "Something went wrong updating this account."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm font-semibold text-gray-600">
              Loading account...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !formData) {
    return (
      <main className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/accounts"
            className="mb-4 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to Accounts
          </Link>

          <div className="rounded-xl bg-white p-6 shadow">
            <h1 className="text-2xl font-bold text-gray-900">
              Account Not Found
            </h1>

            <p className="mt-2 text-gray-600">
              {error ||
                "This account does not exist or the account link is incorrect."}
            </p>

            <p className="mt-4 text-sm text-gray-500">
              Account ID received: {decodedAccountIdFromUrl}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href={`/accounts/${accountIdForUrl}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to Account Detail
            </Link>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">
              Edit Account
            </h1>

            <p className="mt-1 text-gray-600">
              Update account information for{" "}
              {formData.accountName || "this account"}.
            </p>
          </div>

          <Link
            href={`/accounts/${accountIdForUrl}`}
            className="w-fit rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            View Account Detail
          </Link>
        </div>

        {savedMessage ? (
          <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {savedMessage}
          </section>
        ) : null}

        {saveError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {saveError}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Cleaning World Gets Paid</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatCurrency(formData.monthlyRevenue)}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Subcontractor Pay</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatCurrency(
                formData.subcontractorPay || formData.monthlySubcontractorPay
              )}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Gross Margin</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatCurrency(String(grossMargin))}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Gross Margin %</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {grossMarginPercent.toFixed(1)}%
            </p>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">
              Basic Account Information
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Account Name
                </label>
                <input
                  type="text"
                  value={formData.accountName || ""}
                  onChange={(event) =>
                    updateField("accountName", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  value={formData.status || ""}
                  onChange={(event) =>
                    updateField("status", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select Status</option>
                  <option value="Active">Active</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Paused">Paused</option>
                  <option value="Over 90 Days">Over 90 Days</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Cancelled Date
                </label>
                <input
                  type="text"
                  value={formData.cancelledDate || ""}
                  onChange={(event) =>
                    updateField("cancelledDate", event.target.value)
                  }
                  placeholder="Example: 6/10/2026"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Account Health
                </label>
                <input
                  type="text"
                  value={formData.accountHealth || ""}
                  onChange={(event) =>
                    updateField("accountHealth", event.target.value)
                  }
                  placeholder="Stable, Needs Attention, High Risk, etc."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address || ""}
                  onChange={(event) =>
                    updateField("address", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  City
                </label>
                <input
                  type="text"
                  value={formData.city || ""}
                  onChange={(event) => updateField("city", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  State
                </label>
                <input
                  type="text"
                  value={formData.state || ""}
                  onChange={(event) => updateField("state", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Zip</label>
                <input
                  type="text"
                  value={formData.zip || ""}
                  onChange={(event) => updateField("zip", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">
              Service & Assignment
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Manager
                </label>
                <input
                  type="text"
                  value={formData.manager || ""}
                  onChange={(event) =>
                    updateField("manager", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Assigned Subcontractor
                </label>
                <input
                  type="text"
                  value={formData.subcontractor || ""}
                  onChange={(event) =>
                    updateField("subcontractor", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Service Type
                </label>
                <input
                  type="text"
                  value={formData.serviceType || ""}
                  onChange={(event) =>
                    updateField("serviceType", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Frequency
                </label>
                <input
                  type="text"
                  value={formData.frequency || ""}
                  onChange={(event) =>
                    updateField("frequency", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  Cleaning Days
                </label>
                <input
                  type="text"
                  value={formData.cleaningDays || ""}
                  onChange={(event) =>
                    updateField("cleaningDays", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">Billing & Pay</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Cleaning World Gets Paid
                </label>
                <input
                  type="text"
                  value={formData.monthlyRevenue || ""}
                  onChange={(event) =>
                    updateField("monthlyRevenue", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Subcontractor Pay
                </label>
                <input
                  type="text"
                  value={
                    formData.subcontractorPay ||
                    formData.monthlySubcontractorPay ||
                    ""
                  }
                  onChange={(event) =>
                    updateField("subcontractorPay", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">
              Access Information
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Has Key?
                </label>
                <input
                  type="text"
                  value={formData.hasKey || ""}
                  onChange={(event) => updateField("hasKey", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Alarm Code / Instructions
                </label>
                <input
                  type="text"
                  value={formData.alarmCode || ""}
                  onChange={(event) =>
                    updateField("alarmCode", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={formData.contactName || ""}
                  onChange={(event) =>
                    updateField("contactName", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-sm font-medium text-gray-700">
                  Key / Alarm / Access Info
                </label>
                <textarea
                  value={formData.keyAlarmAccessInfo || ""}
                  onChange={(event) =>
                    updateField("keyAlarmAccessInfo", event.target.value)
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  type="text"
                  value={formData.phone || ""}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="text"
                  value={formData.email || ""}
                  onChange={(event) => updateField("email", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">Scope of Work</h2>

            <textarea
              value={formData.scopeOfWork || ""}
              onChange={(event) =>
                updateField("scopeOfWork", event.target.value)
              }
              rows={6}
              className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">Notes</h2>

            <textarea
              value={formData.notes || ""}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={5}
              className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">Change History</h2>

            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              Change history will be added later. For now, this page loads live
              account data and saves account edits back to Google Sheets once
              the updateAccount Apps Script action is added.
            </div>
          </section>

          <section className="flex flex-wrap gap-3 pb-8">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <Link
              href={`/accounts/${accountIdForUrl}`}
              className="rounded-lg bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-300"
            >
              Cancel
            </Link>
          </section>
        </form>
      </div>
    </main>
  );
}