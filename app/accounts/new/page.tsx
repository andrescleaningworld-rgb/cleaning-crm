"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AccountForm = {
  accountName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  manager: string;
  subcontractor: string;
  status: string;
  accountHealth: string;
  accountStartDate: string;
  monthlyRevenue: string;
  monthlySubcontractorPay: string;
  contactName: string;
  phone: string;
  email: string;
  serviceType: string;
  frequency: string;
  cleaningDays: string;
  hasKey: string;
  alarmCode: string;
  keyAlarmAccessInfo: string;
  scopeOfWork: string;
  notes: string;
};

type ExistingAccount = {
  manager?: string;
  subcontractor?: string;
};

type AccountsApiResponse = {
  success?: boolean;
  error?: string;
  accounts?: ExistingAccount[];
  data?: ExistingAccount[];
};

type SaveAccountResponse = {
  success?: boolean;
  error?: string;
  message?: string;
};

const emptyForm: AccountForm = {
  accountName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  manager: "",
  subcontractor: "",
  status: "Active",
  accountHealth: "Stable",
  accountStartDate: "",
  monthlyRevenue: "",
  monthlySubcontractorPay: "",
  contactName: "",
  phone: "",
  email: "",
  serviceType: "",
  frequency: "",
  cleaningDays: "",
  hasKey: "",
  alarmCode: "",
  keyAlarmAccessInfo: "",
  scopeOfWork: "",
  notes: "",
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("API did not return valid JSON.");
  }
}

export default function NewAccountPage() {
  const router = useRouter();

  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [existingAccounts, setExistingAccounts] = useState<ExistingAccount[]>(
    []
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadExistingOptions() {
      try {
        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const data = await readJsonResponse<AccountsApiResponse>(response);

        if (!response.ok || data.success === false) {
          return;
        }

        setExistingAccounts(data.accounts || data.data || []);
      } catch {
        // Do not block the form if options fail to load.
      }
    }

    loadExistingOptions();
  }, []);

  const managerOptions = useMemo(() => {
    return Array.from(
      new Set(
        existingAccounts
          .map((account) => cleanText(account.manager))
          .filter(Boolean)
      )
    ).sort();
  }, [existingAccounts]);

  const subcontractorOptions = useMemo(() => {
    return Array.from(
      new Set(
        existingAccounts
          .map((account) => cleanText(account.subcontractor))
          .filter(Boolean)
      )
    ).sort();
  }, [existingAccounts]);

  function updateField(field: keyof AccountForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage("");
      setError("");

      if (!form.accountName.trim()) {
        throw new Error("Account name is required.");
      }

      const accountPayload: AccountForm = {
        ...form,
        address: form.address.trim(),
        city: "",
        state: "",
        zip: "",
      };

      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addAccount",
          account: accountPayload,
        }),
      });

      const data = await readJsonResponse<SaveAccountResponse>(response);

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Could not save account.");
      }

      setMessage("Account saved successfully.");

      setTimeout(() => {
        router.push("/accounts");
      }, 800);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong saving account."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700 sm:text-sm">
              Cleaning World
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Add New Account
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Add a new account to the Cleaning World Operations & Quality
              Management System. Use the full address in one field.
            </p>
          </div>

          <Link
            href="/accounts"
            className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white shadow-sm no-underline hover:bg-blue-950"
          >
            Back to Accounts
          </Link>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="rounded-3xl border border-slate-200 p-5">
            <h2 className="text-lg font-black text-slate-950">
              Account Information
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Account Name *
                </span>
                <input
                  value={form.accountName}
                  onChange={(event) =>
                    updateField("accountName", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                >
                  <option>Active</option>
                  <option>Paused</option>
                  <option>Over 90 Days</option>
                  <option>Cancelled</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Account Start Date
                </span>
                <input
                  type="date"
                  value={form.accountStartDate}
                  onChange={(event) =>
                    updateField("accountStartDate", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Account Health
                </span>
                <select
                  value={form.accountHealth}
                  onChange={(event) =>
                    updateField("accountHealth", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                >
                  <option>Stable</option>
                  <option>Needs Attention</option>
                  <option>High Risk</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-black text-slate-700">
                  Full Address
                </span>
                <input
                  value={form.address}
                  onChange={(event) =>
                    updateField("address", event.target.value)
                  }
                  placeholder="Example: 1010 Kendal Way, Tarrytown, NY 10591, USA"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  Paste the full address from Google Maps. City, state, and zip
                  do not need to be entered separately.
                </p>
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-5">
            <h2 className="text-lg font-black text-slate-950">
              Assignment & Pricing
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Manager
                </span>
                <input
                  list="manager-options"
                  value={form.manager}
                  onChange={(event) =>
                    updateField("manager", event.target.value)
                  }
                  placeholder="Search or type manager name"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Subcontractor
                </span>
                <input
                  list="subcontractor-options"
                  value={form.subcontractor}
                  onChange={(event) =>
                    updateField("subcontractor", event.target.value)
                  }
                  placeholder="Search or type subcontractor name"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Monthly Revenue
                </span>
                <input
                  value={form.monthlyRevenue}
                  onChange={(event) =>
                    updateField("monthlyRevenue", event.target.value)
                  }
                  placeholder="Example: 2500"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Monthly Subcontractor Pay
                </span>
                <input
                  value={form.monthlySubcontractorPay}
                  onChange={(event) =>
                    updateField("monthlySubcontractorPay", event.target.value)
                  }
                  placeholder="Example: 1800"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-5">
            <h2 className="text-lg font-black text-slate-950">
              Contact & Service Details
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Contact Name
                </span>
                <input
                  value={form.contactName}
                  onChange={(event) =>
                    updateField("contactName", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Email</span>
                <input
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Service Type
                </span>
                <input
                  value={form.serviceType}
                  onChange={(event) =>
                    updateField("serviceType", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Frequency
                </span>
                <input
                  value={form.frequency}
                  onChange={(event) =>
                    updateField("frequency", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Cleaning Days
                </span>
                <input
                  value={form.cleaningDays}
                  onChange={(event) =>
                    updateField("cleaningDays", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-5">
            <h2 className="text-lg font-black text-slate-950">
              Access, Scope & Notes
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Has Key?
                </span>
                <select
                  value={form.hasKey}
                  onChange={(event) => updateField("hasKey", event.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                >
                  <option value="">Select</option>
                  <option>Yes</option>
                  <option>No</option>
                  <option>N/A</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Alarm Code
                </span>
                <input
                  value={form.alarmCode}
                  onChange={(event) =>
                    updateField("alarmCode", event.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-black text-slate-700">
                  Key / Alarm / Access Info
                </span>
                <textarea
                  value={form.keyAlarmAccessInfo}
                  onChange={(event) =>
                    updateField("keyAlarmAccessInfo", event.target.value)
                  }
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-black text-slate-700">
                  Scope of Work
                </span>
                <textarea
                  value={form.scopeOfWork}
                  onChange={(event) =>
                    updateField("scopeOfWork", event.target.value)
                  }
                  rows={4}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-black text-slate-700">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>
            </div>
          </div>

          <datalist id="manager-options">
            {managerOptions.map((manager) => (
              <option key={manager} value={manager} />
            ))}
          </datalist>

          <datalist id="subcontractor-options">
            {subcontractorOptions.map((subcontractor) => (
              <option key={subcontractor} value={subcontractor} />
            ))}
          </datalist>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/accounts"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-700 no-underline hover:bg-slate-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Account"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}