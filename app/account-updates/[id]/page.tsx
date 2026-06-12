"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type RawAccountUpdate = {
  id?: string;
  "Update ID"?: string;
  date?: string;
  "Update Date"?: string;
  accountId?: string;
  "Account ID"?: string;
  accountName?: string;
  "Account Name"?: string;
  Account?: string;
  updateType?: string;
  "Update Type"?: string;
  Type?: string;
  manager?: string;
  Manager?: string;
  "Created By"?: string;
  notes?: string;
  Notes?: string;
  "Update Notes"?: string;
  Description?: string;
  notifyEmail?: string;
  "Notify Email"?: string;
  Email?: string;
};

type AccountUpdate = {
  id: string;
  date: string;
  dateRaw: string;
  accountId: string;
  accountName: string;
  updateType: string;
  manager: string;
  notes: string;
  notifyEmail: string;
};

function cleanText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function createIdFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "-");
}

function formatDate(value: string) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US");
}

function mapRawAccountUpdate(
  raw: RawAccountUpdate,
  index: number
): AccountUpdate {
  const dateRaw = cleanText(raw["Update Date"] || raw.date);

  return {
    id: cleanText(raw["Update ID"] || raw.id, `update-${index + 1}`),
    date: formatDate(dateRaw),
    dateRaw,
    accountId: cleanText(raw["Account ID"] || raw.accountId, ""),
    accountName: cleanText(
      raw["Account Name"] || raw.accountName || raw.Account,
      "Unnamed Account"
    ),
    updateType: cleanText(
      raw["Update Type"] || raw.updateType || raw.Type,
      "General Update"
    ),
    manager: cleanText(raw.Manager || raw.manager || raw["Created By"], "N/A"),
    notes: cleanText(
      raw.Notes || raw.notes || raw["Update Notes"] || raw.Description,
      "N/A"
    ),
    notifyEmail: cleanText(raw["Notify Email"] || raw.notifyEmail || raw.Email),
  };
}

function getParamId(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value || "";

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export default function AccountUpdateDetailPage() {
  const params = useParams();

  const updateId = useMemo(() => {
    return getParamId(params.id);
  }, [params.id]);

  const [updates, setUpdates] = useState<AccountUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadUpdates() {
      try {
        const response = await fetch("/api/account-updates", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Could not load account updates.");
        }

        const rawUpdates =
          result.accountUpdates || result.updates || result.data || [];

        const mappedUpdates: AccountUpdate[] = rawUpdates
          .map(mapRawAccountUpdate)
          .filter((update: AccountUpdate) => {
            return update.accountName !== "Unnamed Account" || update.notes !== "N/A";
          });

        setUpdates(mappedUpdates);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load account update details."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadUpdates();
  }, []);

  const update = updates.find((item) => item.id === updateId);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-gray-700">Loading account update details...</p>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl">
          <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {errorMessage}
          </section>

          <div className="mt-5">
            <Link
              href="/account-updates"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Back to Account Updates
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!update) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl">
          <section className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
            <h1 className="text-2xl font-bold text-yellow-900">
              Account Update Not Found
            </h1>

            <p className="mt-2 text-yellow-800">
              This update could not be found. The update ID may have changed if
              the sheet does not have a permanent Update ID column yet.
            </p>

            <p className="mt-2 text-sm text-yellow-700">
              Requested Update ID: {updateId || "N/A"}
            </p>
          </section>

          <div className="mt-5">
            <Link
              href="/account-updates"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Back to Account Updates
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const accountLink = `/accounts/${
    update.accountId || createIdFromName(update.accountName)
  }`;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">
              Account Update Details
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              {update.updateType}
            </h1>

            <p className="mt-1 text-gray-600">{update.accountName}</p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <Link
              href="/account-updates"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-center font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Back to Updates
            </Link>

            <Link
              href={accountLink}
              className="rounded-lg bg-purple-700 px-5 py-3 text-center font-semibold text-white shadow-sm hover:bg-purple-800"
            >
              View Account
            </Link>
          </div>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-bold text-gray-900">
              Update Summary
            </h2>
          </div>

          <div className="grid gap-0 md:grid-cols-2">
            <div className="border-b border-gray-200 p-5 md:border-r">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Date
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {update.date}
              </p>
            </div>

            <div className="border-b border-gray-200 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Account
              </p>
              <Link
                href={accountLink}
                className="mt-1 block text-lg font-semibold text-purple-700 hover:underline"
              >
                {update.accountName}
              </Link>
            </div>

            <div className="border-b border-gray-200 p-5 md:border-r">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Update Type
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {update.updateType}
              </p>
            </div>

            <div className="border-b border-gray-200 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Manager / Created By
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {update.manager}
              </p>
            </div>

            <div className="border-b border-gray-200 p-5 md:col-span-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Notify Email
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {update.notifyEmail || "N/A"}
              </p>
            </div>

            <div className="p-5 md:col-span-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Full Notes
              </p>

              <div className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-5 text-gray-900">
                {update.notes}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-5">
          <h2 className="text-lg font-bold text-purple-950">
            Update ID
          </h2>

          <p className="mt-1 text-sm text-purple-800">{update.id}</p>

          <p className="mt-3 text-sm text-purple-700">
            Later, we should make sure Apps Script saves permanent update IDs so
            these links never change.
          </p>
        </section>
      </div>
    </main>
  );
}