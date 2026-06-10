"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Account = {
  id?: string;
  accountName?: string;
  manager?: string;
  subcontractor?: string;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function NewVisitPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountFromUrl = clean(searchParams.get("account"));
  const accountIdFromUrl = clean(searchParams.get("accountId"));

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [date, setDate] = useState(todayDate());
  const [accountName, setAccountName] = useState(accountFromUrl);
  const [manager, setManager] = useState("");
  const [subcontractor, setSubcontractor] = useState("");
  const [visitType, setVisitType] = useState("Routine Visit");
  const [condition, setCondition] = useState("8");
  const [followUpNeeded, setFollowUpNeeded] = useState("No");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAccounts() {
      try {
        setLoadingAccounts(true);

        const response = await fetch("/api/accounts", {
          method: "GET",
          cache: "no-store",
        });

        const text = await response.text();
        let data: any;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("Accounts API did not return valid JSON.");
        }

        if (!response.ok || data.success === false) {
          throw new Error(data.error || "Failed to load accounts.");
        }

        const loadedAccounts = Array.isArray(data.accounts)
          ? data.accounts
          : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];

        setAccounts(loadedAccounts);

        if (accountFromUrl || accountIdFromUrl) {
          const matchingAccount = loadedAccounts.find((account: Account) => {
            return (
              clean(account.accountName) === accountFromUrl ||
              clean(account.id) === accountIdFromUrl
            );
          });

          if (matchingAccount) {
            setAccountName(clean(matchingAccount.accountName));
            setManager(clean(matchingAccount.manager));
            setSubcontractor(clean(matchingAccount.subcontractor));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error loading accounts.");
      } finally {
        setLoadingAccounts(false);
      }
    }

    loadAccounts();
  }, [accountFromUrl, accountIdFromUrl]);

  const selectedAccount = useMemo(() => {
    return accounts.find((account) => clean(account.accountName) === accountName);
  }, [accounts, accountName]);

  useEffect(() => {
    if (!selectedAccount) return;

    setManager(clean(selectedAccount.manager));
    setSubcontractor(clean(selectedAccount.subcontractor));
  }, [selectedAccount]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!date) {
        throw new Error("Please enter a visit date.");
      }

      if (!accountName) {
        throw new Error("Please select or enter an account name.");
      }

      const response = await fetch("/api/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          date,
          accountName,
          manager,
          subcontractor,
          visitType,
          condition,
          notes,
          followUpNeeded,
          followUpDate,
        }),
      });

      const text = await response.text();
      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Visits API did not return valid JSON while saving.");
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to save visit.");
      }

      setMessage(data.message || "Visit saved successfully.");

      setTimeout(() => {
        router.push("/visits");
        router.refresh();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error saving visit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Add Visit</h1>
          <p className="mt-2 text-gray-500">
            Save an account visit, condition score, notes, and follow-up information.
          </p>
        </div>

        <Link
          href="/visits"
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm"
        >
          Back to Visits
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        {message ? (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 font-bold text-green-700">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Visit Date
            </span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Account
            </span>

            {loadingAccounts ? (
              <input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="Loading accounts..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                required
              />
            ) : (
              <input
                list="account-list"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="Search or type account name"
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                required
              />
            )}

            <datalist id="account-list">
              {accounts.map((account, index) => (
                <option
                  key={`${account.id || account.accountName || "account"}-${index}`}
                  value={clean(account.accountName)}
                />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Manager / Visited By
            </span>
            <input
              value={manager}
              onChange={(event) => setManager(event.target.value)}
              placeholder="Manager"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Subcontractor
            </span>
            <input
              value={subcontractor}
              onChange={(event) => setSubcontractor(event.target.value)}
              placeholder="Subcontractor"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Visit Type
            </span>
            <select
              value={visitType}
              onChange={(event) => setVisitType(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option>Routine Visit</option>
              <option>Complaint Follow-Up</option>
              <option>Quality Check</option>
              <option>Onboarding New Account</option>
              <option>Customer Request</option>
              <option>Subcontractor Review</option>
              <option>Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Condition Score 0-10
            </span>
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option value="">Not Scored</option>
              <option value="10">10 - Excellent</option>
              <option value="9">9 - Very Good</option>
              <option value="8">8 - Good</option>
              <option value="7">7 - Needs Attention</option>
              <option value="6">6 - Problem</option>
              <option value="5">5 - High Risk</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
              <option value="0">0</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Follow-Up Needed
            </span>
            <select
              value={followUpNeeded}
              onChange={(event) => setFollowUpNeeded(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
            >
              <option>No</option>
              <option>Yes</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Follow-Up Date
            </span>
            <input
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </label>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-gray-700">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Write visit notes, issues found, customer feedback, or follow-up details..."
            rows={6}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </label>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Visit"}
          </button>

          <Link
            href="/visits"
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-900"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function NewVisitPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            Loading visit form...
          </div>
        </main>
      }
    >
      <NewVisitPageContent />
    </Suspense>
  );
}