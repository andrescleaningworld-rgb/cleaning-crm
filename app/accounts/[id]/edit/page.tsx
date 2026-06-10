"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

type Account = {
  id: string;
  name: string;
  status: string;
  manager: string;
  subcontractor: string;
  cleaningWorldPay: number;
  subcontractorPay: number;
  address: string;
  city: string;
  state: string;
  serviceSchedule: string;
  visitType: string;
  hasKey: string;
  alarm: string;
  alarmCode: string;
  accountHealth: number;
  notes: string;
};

const accounts: Account[] = [
  {
    id: "lehmann-pools",
    name: "Lehmann Pools",
    status: "Active",
    manager: "Andrés",
    subcontractor: "Edgar",
    cleaningWorldPay: 3200,
    subcontractorPay: 2100,
    address: "Sample Address",
    city: "Mahwah",
    state: "NJ",
    serviceSchedule: "5x per week",
    visitType: "Regular Account Visit",
    hasKey: "Yes",
    alarm: "Yes",
    alarmCode: "On file",
    accountHealth: 8,
    notes: "Good account. Continue monitoring quality and communication.",
  },
  {
    id: "4wall-entertainment",
    name: "4Wall Entertainment",
    status: "Active",
    manager: "Greg",
    subcontractor: "Fernando",
    cleaningWorldPay: 4500,
    subcontractorPay: 3000,
    address: "Sample Address",
    city: "Moonachie",
    state: "NJ",
    serviceSchedule: "5x per week",
    visitType: "Regular Account Visit",
    hasKey: "Yes",
    alarm: "No",
    alarmCode: "N/A",
    accountHealth: 7,
    notes: "Large account. Keep an eye on complaints and supply needs.",
  },
  {
    id: "paris-baguette",
    name: "Paris Baguette",
    status: "Active",
    manager: "Drew",
    subcontractor: "Juana",
    cleaningWorldPay: 2800,
    subcontractorPay: 1900,
    address: "Sample Address",
    city: "Fort Lee",
    state: "NJ",
    serviceSchedule: "7x per week",
    visitType: "Regular Account Visit",
    hasKey: "No",
    alarm: "Yes",
    alarmCode: "Customer access required",
    accountHealth: 6,
    notes: "Needs closer follow-up due to frequency and customer expectations.",
  },
  {
    id: "independent-chemical",
    name: "Independent Chemical",
    status: "Over 90 days",
    manager: "Andrés",
    subcontractor: "Vicky",
    cleaningWorldPay: 3900,
    subcontractorPay: 2600,
    address: "Sample Address",
    city: "Paterson",
    state: "NJ",
    serviceSchedule: "3x per week",
    visitType: "Problem Account Visit",
    hasKey: "Yes",
    alarm: "Yes",
    alarmCode: "On file",
    accountHealth: 5,
    notes: "Needs management attention. Track complaints, visits, and improvements.",
  },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function EditAccountPage() {
  const params = useParams();
  const accountId = String(params.id);

  const account = accounts.find((item) => item.id === accountId);

  const [savedMessage, setSavedMessage] = useState("");

  const [formData, setFormData] = useState<Account | null>(
    account ? { ...account } : null
  );

  if (!account || !formData) {
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
              This account does not exist or the account link is incorrect.
            </p>

            <p className="mt-4 text-sm text-gray-500">
              Account ID received: {accountId}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const grossMargin = formData.cleaningWorldPay - formData.subcontractorPay;

  const grossMarginPercent =
    formData.cleaningWorldPay > 0
      ? (grossMargin / formData.cleaningWorldPay) * 100
      : 0;

  function updateField(field: keyof Account, value: string) {
    setFormData((current) => {
      if (!current) return current;

      if (
        field === "cleaningWorldPay" ||
        field === "subcontractorPay" ||
        field === "accountHealth"
      ) {
        return {
          ...current,
          [field]: Number(value),
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });

    setSavedMessage("");
  }

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();

    setSavedMessage(
      "Saved for now. Later this will update Google Sheets and save change history."
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href={`/accounts/${formData.id}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to Account Detail
            </Link>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">
              Edit Account
            </h1>

            <p className="mt-1 text-gray-600">
              Update account information for {formData.name}.
            </p>
          </div>

          <Link
            href={`/accounts/${formData.id}`}
            className="w-fit rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            View Account Detail
          </Link>
        </div>

        {savedMessage && (
          <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {savedMessage}
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Cleaning World Gets Paid</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatCurrency(formData.cleaningWorldPay)}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Subcontractor Pay</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatCurrency(formData.subcontractorPay)}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Gross Margin</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {formatCurrency(grossMargin)}
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
                  value={formData.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(event) =>
                    updateField("status", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option>Active</option>
                  <option>Cancelled</option>
                  <option>Over 90 days</option>
                  <option>Paused</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
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
                  value={formData.city}
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
                  value={formData.state}
                  onChange={(event) => updateField("state", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Account Health
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.accountHealth}
                  onChange={(event) =>
                    updateField("accountHealth", event.target.value)
                  }
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
                <select
                  value={formData.manager}
                  onChange={(event) =>
                    updateField("manager", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option>Andrés</option>
                  <option>Greg</option>
                  <option>Drew</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Assigned Subcontractor
                </label>
                <select
                  value={formData.subcontractor}
                  onChange={(event) =>
                    updateField("subcontractor", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option>Edgar</option>
                  <option>Fernando</option>
                  <option>Juana</option>
                  <option>Vicky</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Service Schedule
                </label>
                <input
                  type="text"
                  value={formData.serviceSchedule}
                  onChange={(event) =>
                    updateField("serviceSchedule", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Visit Type
                </label>
                <select
                  value={formData.visitType}
                  onChange={(event) =>
                    updateField("visitType", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option>Regular Account Visit</option>
                  <option>Problem Account Visit</option>
                  <option>Complaint Follow-Up</option>
                  <option>Onboarding New Account</option>
                  <option>Quality Control Visit</option>
                </select>
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
                  type="number"
                  value={formData.cleaningWorldPay}
                  onChange={(event) =>
                    updateField("cleaningWorldPay", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Subcontractor Pay
                </label>
                <input
                  type="number"
                  value={formData.subcontractorPay}
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
                <select
                  value={formData.hasKey}
                  onChange={(event) =>
                    updateField("hasKey", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option>Yes</option>
                  <option>No</option>
                  <option>Customer Access Required</option>
                  <option>Lockbox</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Alarm?
                </label>
                <select
                  value={formData.alarm}
                  onChange={(event) => updateField("alarm", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option>Yes</option>
                  <option>No</option>
                  <option>Unknown</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Alarm Code / Instructions
                </label>
                <input
                  type="text"
                  value={formData.alarmCode}
                  onChange={(event) =>
                    updateField("alarmCode", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">Notes</h2>

            <textarea
              value={formData.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={5}
              className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900">Change History</h2>

            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              Change history will be active once we connect this page to Google
              Sheets. For now this is a placeholder so we keep the structure
              ready.
            </div>
          </section>

          <section className="flex flex-wrap gap-3 pb-8">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Save Changes
            </button>

            <Link
              href={`/accounts/${formData.id}`}
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