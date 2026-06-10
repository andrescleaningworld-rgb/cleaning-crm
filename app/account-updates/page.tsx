"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type RawAccount = {
  id?: string;
  rowNumber?: number;
  accountId?: string;
  accountName?: string;
  "Account ID"?: string;
  "Account Name"?: string;
  Account?: string;
  Name?: string;
  Manager?: string;
  manager?: string;
  Subcontractor?: string;
  subcontractor?: string;
  "Sub Contractor"?: string;
};

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

type Account = {
  id: string;
  name: string;
  manager: string;
  subcontractor: string;
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

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(value: string) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US");
}

function getTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function mapRawAccount(raw: RawAccount): Account {
  const name = cleanText(
    raw["Account Name"] || raw.accountName || raw.Account || raw.Name,
    "Unnamed Account"
  );

  const id = cleanText(
    raw["Account ID"] || raw.accountId || raw.id || raw.rowNumber,
    createIdFromName(name)
  );

  return {
    id,
    name,
    manager: cleanText(raw.Manager || raw.manager, "Unassigned"),
    subcontractor: cleanText(
      raw.Subcontractor || raw.subcontractor || raw["Sub Contractor"],
      "Unassigned"
    ),
  };
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

function AccountUpdatesPageContent() {
  const searchParams = useSearchParams();

  const accountIdFromUrl = searchParams.get("accountId") || "";
  const accountNameFromUrl = searchParams.get("account") || "";

  const openedFromAccountDetail = Boolean(accountIdFromUrl || accountNameFromUrl);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [updates, setUpdates] = useState<AccountUpdate[]>([]);

  const [accountSearchText, setAccountSearchText] = useState(accountNameFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState(accountIdFromUrl);
  const [selectedAccountName, setSelectedAccountName] =
    useState(accountNameFromUrl);
  const [selectedManager, setSelectedManager] = useState("");

  const [updateDate, setUpdateDate] = useState(todayDate());
  const [updateType, setUpdateType] = useState("General Update");
  const [manager, setManager] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");

  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [managerFilter, setManagerFilter] = useState("All Managers");
  const [sortOption, setSortOption] = useState("Newest First");

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingUpdates, setIsLoadingUpdates] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    async function loadAccounts() {
      try {
        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Could not load accounts.");
        }

        const rawAccounts = result.accounts || result.data || [];

        const mappedAccounts: Account[] = rawAccounts
          .map(mapRawAccount)
          .filter((account: Account) => account.name !== "Unnamed Account");

        const uniqueAccounts = Array.from(
          new Map(mappedAccounts.map((account) => [account.id, account])).values()
        );

        setAccounts(uniqueAccounts);

        if (accountIdFromUrl || accountNameFromUrl) {
          const matchingAccount = uniqueAccounts.find((account) => {
            return (
              account.id === accountIdFromUrl ||
              account.name === accountNameFromUrl
            );
          });

          if (matchingAccount) {
            setSelectedAccountId(matchingAccount.id);
            setSelectedAccountName(matchingAccount.name);
            setSelectedManager(matchingAccount.manager);
            setManager(matchingAccount.manager);
            setAccountSearchText(matchingAccount.name);
          } else if (accountNameFromUrl) {
            setSelectedAccountId(accountIdFromUrl);
            setSelectedAccountName(accountNameFromUrl);
            setAccountSearchText(accountNameFromUrl);
          }
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load accounts."
        );
      } finally {
        setIsLoadingAccounts(false);
      }
    }

    loadAccounts();
  }, [accountIdFromUrl, accountNameFromUrl]);

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

        const rawUpdates = result.accountUpdates || result.updates || result.data || [];

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
            : "Could not load account updates."
        );
      } finally {
        setIsLoadingUpdates(false);
      }
    }

    loadUpdates();
  }, []);

  const filteredAccountOptions = useMemo(() => {
    const search = accountSearchText.toLowerCase().trim();

    if (!search) return accounts.slice(0, 20);

    return accounts
      .filter((account) => {
        return (
          account.name.toLowerCase().includes(search) ||
          account.id.toLowerCase().includes(search)
        );
      })
      .slice(0, 20);
  }, [accounts, accountSearchText]);

  const updateTypeOptions = useMemo(() => {
    const uniqueTypes = Array.from(
      new Set(
        updates
          .map((update) => update.updateType)
          .filter((type) => type && type !== "N/A")
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["All Types", ...uniqueTypes];
  }, [updates]);

  const managerOptions = useMemo(() => {
    const uniqueManagers = Array.from(
      new Set(
        updates
          .map((update) => update.manager)
          .filter((managerName) => managerName && managerName !== "N/A")
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["All Managers", ...uniqueManagers];
  }, [updates]);

  const filteredUpdates = useMemo(() => {
    const search = searchText.toLowerCase().trim();

    const filtered = updates.filter((update) => {
      const matchesAccount =
        accountIdFromUrl || accountNameFromUrl
          ? update.accountId === accountIdFromUrl ||
            update.accountName === accountNameFromUrl ||
            update.accountName === selectedAccountName
          : true;

      const matchesSearch = search
        ? update.accountName.toLowerCase().includes(search) ||
          update.updateType.toLowerCase().includes(search) ||
          update.manager.toLowerCase().includes(search) ||
          update.notes.toLowerCase().includes(search) ||
          update.notifyEmail.toLowerCase().includes(search)
        : true;

      const matchesType =
        typeFilter === "All Types" ? true : update.updateType === typeFilter;

      const matchesManager =
        managerFilter === "All Managers" ? true : update.manager === managerFilter;

      return matchesAccount && matchesSearch && matchesType && matchesManager;
    });

    return filtered.sort((a, b) => {
      if (sortOption === "Oldest First") {
        return getTime(a.dateRaw) - getTime(b.dateRaw);
      }

      if (sortOption === "Account A-Z") {
        return a.accountName.localeCompare(b.accountName);
      }

      if (sortOption === "Account Z-A") {
        return b.accountName.localeCompare(a.accountName);
      }

      if (sortOption === "Type A-Z") {
        return a.updateType.localeCompare(b.updateType);
      }

      if (sortOption === "Manager A-Z") {
        return a.manager.localeCompare(b.manager);
      }

      return getTime(b.dateRaw) - getTime(a.dateRaw);
    });
  }, [
    updates,
    searchText,
    typeFilter,
    managerFilter,
    sortOption,
    accountIdFromUrl,
    accountNameFromUrl,
    selectedAccountName,
  ]);

  function handleAccountSelect(account: Account) {
    setSelectedAccountId(account.id);
    setSelectedAccountName(account.name);
    setSelectedManager(account.manager);
    setManager(account.manager);
    setAccountSearchText(account.name);
  }

  function clearFilters() {
    setSearchText("");
    setTypeFilter("All Types");
    setManagerFilter("All Managers");
    setSortOption("Newest First");
  }

  async function handleAddUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    if (!selectedAccountName) {
      setSaveMessage("Please select an account before saving the update.");
      return;
    }

    if (!updateDate || !updateType || !notes.trim()) {
      setSaveMessage("Please complete the date, update type, and notes.");
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    const finalAccountId =
      selectedAccountId || createIdFromName(selectedAccountName);

    const finalManager = manager || selectedManager;

    try {
      const response = await fetch("/api/account-updates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          action: "addAccountUpdate",
          accountId: finalAccountId,
          accountName: selectedAccountName,
          date: updateDate,
          updateDate,
          updateType,
          manager: finalManager,
          notes,
          notifyEmail,

          "Account ID": finalAccountId,
          "Account Name": selectedAccountName,
          Date: updateDate,
          "Update Date": updateDate,
          "Update Type": updateType,
          Manager: finalManager,
          "Created By": finalManager,
          Notes: notes,
          "Update Notes": notes,
          "Notify Email": notifyEmail,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not save account update.");
      }

      const newUpdate: AccountUpdate = {
        id: result.id || `update-${Date.now()}`,
        date: formatDate(updateDate),
        dateRaw: updateDate,
        accountId: finalAccountId,
        accountName: selectedAccountName,
        updateType,
        manager: finalManager || "N/A",
        notes,
        notifyEmail,
      };

      setUpdates((currentUpdates) => [newUpdate, ...currentUpdates]);

      setSaveMessage("Account update saved successfully.");

      setUpdateDate(todayDate());
      setUpdateType("General Update");
      setNotes("");
      setNotifyEmail("");

      if (!openedFromAccountDetail) {
        setSelectedAccountId("");
        setSelectedAccountName("");
        setSelectedManager("");
        setAccountSearchText("");
        setManager("");
      }
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "Could not save account update."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Account Updates
            </h1>

            <p className="mt-1 text-gray-600">
              {openedFromAccountDetail
                ? "Review previous updates first, then add a new update for this account below."
                : "Track account notes, service changes, missed cleanings, price changes, and important updates."}
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            {openedFromAccountDetail ? (
              <Link
                href={`/accounts/${
                  selectedAccountId || createIdFromName(selectedAccountName)
                }`}
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-center font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Back to Account
              </Link>
            ) : (
              <Link
                href="/accounts"
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-center font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Back to Accounts
              </Link>
            )}
          </div>
        </div>

        {errorMessage ? (
          <section className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {openedFromAccountDetail
                      ? `Updates Log${
                          selectedAccountName ? ` - ${selectedAccountName}` : ""
                        }`
                      : "Account Updates Log"}
                  </h2>

                  <p className="mt-1 text-sm text-gray-600">
                    {isLoadingUpdates
                      ? "Loading account updates from Google Sheets..."
                      : `${filteredUpdates.length} update${
                          filteredUpdates.length === 1 ? "" : "s"
                        } showing`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
                >
                  Clear Filters
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search updates..."
                  className="rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 xl:col-span-2"
                />

                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                >
                  {updateTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                <select
                  value={managerFilter}
                  onChange={(event) => setManagerFilter(event.target.value)}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                >
                  {managerOptions.map((managerName) => (
                    <option key={managerName} value={managerName}>
                      {managerName}
                    </option>
                  ))}
                </select>

                <select
                  value={sortOption}
                  onChange={(event) => setSortOption(event.target.value)}
                  className="rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                >
                  <option value="Newest First">Newest First</option>
                  <option value="Oldest First">Oldest First</option>
                  <option value="Account A-Z">Account A-Z</option>
                  <option value="Account Z-A">Account Z-A</option>
                  <option value="Type A-Z">Type A-Z</option>
                  <option value="Manager A-Z">Manager A-Z</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Manager</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 font-semibold">Notify Email</th>
                </tr>
              </thead>

              <tbody>
                {filteredUpdates.map((update) => (
                  <tr key={update.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{update.date}</td>

                    <td className="px-4 py-3">
                      <Link
                        href={`/accounts/${
                          update.accountId ||
                          createIdFromName(update.accountName)
                        }`}
                        className="font-semibold text-purple-700 hover:underline"
                      >
                        {update.accountName}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      {update.updateType}
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      {update.manager}
                    </td>

                    <td className="max-w-lg px-4 py-3 text-gray-700">
                      <span className="line-clamp-2">{update.notes}</span>
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      {update.notifyEmail || "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLoadingUpdates && filteredUpdates.length === 0 ? (
            <div className="p-6 text-center text-gray-600">
              No account updates found.
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Add New Update</h2>

          {openedFromAccountDetail ? (
            <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-5 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">
                Update For
              </p>
              <p className="mt-1 text-2xl font-bold text-purple-950">
                {selectedAccountName || accountNameFromUrl || accountIdFromUrl}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
              <label className="text-sm font-semibold text-gray-700">
                Search Account
              </label>

              <input
                type="text"
                value={accountSearchText}
                onChange={(event) => {
                  setAccountSearchText(event.target.value);
                  setSelectedAccountId("");
                  setSelectedAccountName("");
                  setSelectedManager("");
                  setManager("");
                }}
                placeholder={
                  isLoadingAccounts
                    ? "Loading accounts..."
                    : "Start typing account name..."
                }
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
              />

              {accountSearchText && filteredAccountOptions.length > 0 ? (
                <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                  {filteredAccountOptions.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleAccountSelect(account)}
                      className="block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-purple-50"
                    >
                      <span className="block font-semibold text-gray-900">
                        {account.name}
                      </span>
                      <span className="block text-xs text-gray-500">
                        Manager: {account.manager} | Sub: {account.subcontractor}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {selectedAccountName ? (
                <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">
                    Selected Account: {selectedAccountName}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          <form onSubmit={handleAddUpdate} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Update Date
                </label>

                <input
                  type="date"
                  value={updateDate}
                  onChange={(event) => setUpdateDate(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Update Type
                </label>

                <select
                  value={updateType}
                  onChange={(event) => setUpdateType(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                >
                  <option value="General Update">General Update</option>
                  <option value="Service Change">Service Change</option>
                  <option value="Price Change">Price Change</option>
                  <option value="Missed Cleaning">Missed Cleaning</option>
                  <option value="Schedule Change">Schedule Change</option>
                  <option value="Key / Alarm Update">Key / Alarm Update</option>
                  <option value="Subcontractor Update">Subcontractor Update</option>
                  <option value="Customer Note">Customer Note</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Manager
                </label>

                <input
                  type="text"
                  value={manager}
                  onChange={(event) => setManager(event.target.value)}
                  placeholder="Andrés, Greg, Drew..."
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Write the account update here..."
                rows={4}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Notify Email
              </label>

              <input
                type="email"
                value={notifyEmail}
                onChange={(event) => setNotifyEmail(event.target.value)}
                placeholder="Optional email notification"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
              />
            </div>

            {saveMessage ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-800">
                {saveMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-purple-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-purple-800 disabled:bg-purple-300"
              >
                {isSaving ? "Saving..." : "Save Update"}
              </button>

              {openedFromAccountDetail ? (
                <Link
                  href={`/accounts/${
                    selectedAccountId || createIdFromName(selectedAccountName)
                  }`}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-center font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
                >
                  Cancel / Back to Account
                </Link>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function AccountUpdatesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-6">
          Loading account updates...
        </main>
      }
    >
      <AccountUpdatesPageContent />
    </Suspense>
  );
}