"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  LABELS,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  TextAreaField,
  showToast,
} from "@/app/ui";
import { useHandoffs } from "../components/handoffs";
import ToProcess, { handoffForUpdate, processedLine } from "./to-process";

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
  // Layout only: the add form and the filters each open in a sheet.
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Handoffs: which updates the office still has to process, and who processed the rest.
  const handoffs = useHandoffs();
  const focusProcessId = searchParams.get("process") ?? "";
  const [savedMessage, setSavedMessage] = useState("");

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

  const visibleUpdates = useMemo(() => {
    return filteredUpdates.slice(0, 5);
  }, [filteredUpdates]);

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

  async function handleAddUpdate(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

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
    setSavedMessage("");

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

      setSavedMessage("Account update saved successfully.");
      if (handoffs.state === "ready") {
        showToast("Done ✓ — sent to Office");
        void handoffs.reload();
      }
      setShowForm(false);

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

  const accountHref = `/accounts/${selectedAccountId || createIdFromName(selectedAccountName)}`;

  // "To process" or "Processed ✓ by ..., day" on an update the office tracks.
  // Updates from before this feature have nothing to show.
  const processStatus = (update: AccountUpdate) => {
    const item = handoffForUpdate(handoffs.items, update);
    if (!item) return null;
    return item.doneAt ? (
      <p className="ui-guide ui-guide-done">{processedLine(item)}</p>
    ) : (
      <div style={{ marginTop: 8 }}>
        <StatusPill kind="waiting">To process</StatusPill>
      </div>
    );
  };
  const filtersOn =
    (typeFilter !== "All Types" ? 1 : 0) + (managerFilter !== "All Managers" ? 1 : 0) + (sortOption !== "Newest First" ? 1 : 0);

  return (
    <Screen
      title="Account Updates"
      subtitle={
        openedFromAccountDetail
          ? "Review the latest updates first, then add a new update for this account."
          : "Track account notes, service changes, missed cleanings, price changes, and important updates."
      }
      backHref={openedFromAccountDetail ? accountHref : "/accounts"}
      action={
        <BigButton
          icon="plus"
          onClick={() => {
            setSaveMessage("");
            setShowForm(true);
          }}
        >
          Add update
        </BigButton>
      }
    >
      {errorMessage ? <ErrorBox title="Something did not load." text={errorMessage} /> : null}
      {savedMessage ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {savedMessage}
        </p>
      ) : null}

      {/* To process: only when not looking at one account's history. */}
      {!openedFromAccountDetail ? <ToProcess handoffs={handoffs} focusId={focusProcessId} /> : null}

      <h2 className="ui-section-title">All updates</h2>
      <SearchBar value={searchText} onChange={setSearchText} label="Find an update" placeholder="Find an update" />

      <div className="ui-actions-row">
        <BigButton kind="second" onClick={() => setShowFilters(true)}>
          {filtersOn ? `Filter and sort (${filtersOn} on)` : "Filter and sort"}
        </BigButton>
        <BigButton kind="quiet" onClick={clearFilters}>
          Clear filters
        </BigButton>
      </div>

      <div role="status">
        <p className="ui-strong">
          {openedFromAccountDetail ? `Latest Updates${selectedAccountName ? ` - ${selectedAccountName}` : ""}` : "Latest Account Updates"}
        </p>
        {isLoadingUpdates ? null : (
          <p className="ui-muted">
            {visibleUpdates.length} of {filteredUpdates.length} update{filteredUpdates.length === 1 ? "" : "s"} showing. Only the latest 5
            results are shown; use search or filters to narrow the list.
          </p>
        )}
      </div>

      {isLoadingUpdates ? (
        <SkeletonList rows={3} />
      ) : filteredUpdates.length === 0 ? (
        <EmptyState title="No account updates found" text="Try a different search, or clear the filters." />
      ) : (
        <CardList
          label="Account updates"
          items={visibleUpdates}
          getKey={(update) => update.id}
          renderCard={(update) => (
            <Card title={update.accountName}>
              <p className="ui-card-text">
                {update.date} · {update.updateType} · {update.manager}
              </p>
              <p className="ui-card-text ui-clamp">{update.notes}</p>
              {update.notifyEmail ? <p className="ui-card-text">Notified: {update.notifyEmail}</p> : null}
              {processStatus(update)}
              <div className="ui-actions-row" style={{ marginTop: 12 }}>
                <BigButton kind="second" href={`/account-updates/${encodeURIComponent(update.id)}`}>
                  {LABELS.open}
                </BigButton>
                <BigButton kind="quiet" href={`/accounts/${update.accountId || createIdFromName(update.accountName)}`}>
                  Go to account
                </BigButton>
              </div>
            </Card>
          )}
          columns={[
            { header: "Date", cell: (update) => <span className="ui-nowrap">{update.date}</span> },
            {
              header: "Account",
              cell: (update) => (
                <Link href={`/accounts/${update.accountId || createIdFromName(update.accountName)}`} className="ui-table-rowlink">
                  {update.accountName}
                </Link>
              ),
            },
            { header: "Type", cell: (update) => update.updateType },
            { header: "Manager", cell: (update) => update.manager },
            { header: "Notes", cell: (update) => <span className="ui-clamp">{update.notes}</span> },
            { header: "Notify Email", cell: (update) => update.notifyEmail || "None" },
            { header: "Office", cell: (update) => processStatus(update) ?? "" },
            {
              header: "Action",
              cell: (update) => (
                <BigButton kind="second" href={`/account-updates/${encodeURIComponent(update.id)}`}>
                  {LABELS.open}
                </BigButton>
              ),
            },
          ]}
        />
      )}

      <Sheet open={showFilters} title="Filter and sort" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          {updateTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </SelectField>
        <SelectField label="Manager" value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
          {managerOptions.map((managerName) => (
            <option key={managerName} value={managerName}>
              {managerName}
            </option>
          ))}
        </SelectField>
        <SelectField label="Sort" value={sortOption} onChange={(event) => setSortOption(event.target.value)}>
          <option value="Newest First">Newest First</option>
          <option value="Oldest First">Oldest First</option>
          <option value="Account A-Z">Account A-Z</option>
          <option value="Account Z-A">Account Z-A</option>
          <option value="Type A-Z">Type A-Z</option>
          <option value="Manager A-Z">Manager A-Z</option>
        </SelectField>
        <div>
          <BigButton kind="quiet" onClick={clearFilters}>
            Clear filters
          </BigButton>
        </div>
      </Sheet>

      <Sheet
        open={showForm}
        title="Add update"
        text={openedFromAccountDetail ? `Update for ${selectedAccountName || accountNameFromUrl || accountIdFromUrl}` : undefined}
        onClose={() => setShowForm(false)}
        busy={isSaving}
        actions={
          <BigButton busy={isSaving} busyLabel="Saving…" onClick={() => void handleAddUpdate()}>
            Save update
          </BigButton>
        }
      >
        {openedFromAccountDetail ? null : (
          <>
            <Field
              label="Account"
              hint="Start typing the account name, then tap it in the list."
              value={accountSearchText}
              onChange={(event) => {
                setAccountSearchText(event.target.value);
                setSelectedAccountId("");
                setSelectedAccountName("");
                setSelectedManager("");
                setManager("");
              }}
              placeholder={isLoadingAccounts ? "Loading accounts…" : "Start typing account name"}
            />

            {accountSearchText && !selectedAccountName && filteredAccountOptions.length > 0 ? (
              <div className="ui-picker-list">
                {filteredAccountOptions.map((account) => (
                  <button key={account.id} type="button" onClick={() => handleAccountSelect(account)} className="ui-picker-option">
                    <span style={{ minWidth: 0, textAlign: "left" }}>
                      <span className="ui-strong" style={{ display: "block" }}>
                        {account.name}
                      </span>
                      <span className="ui-muted" style={{ display: "block" }}>
                        Manager: {account.manager} | Sub: {account.subcontractor}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {selectedAccountName ? (
              <p className="ui-savestatus ui-savestatus-saved" role="status">
                Selected account: {selectedAccountName}
              </p>
            ) : null}
          </>
        )}

        <Field label="Update date" type="date" value={updateDate} onChange={(event) => setUpdateDate(event.target.value)} />
        <SelectField label="Update type" value={updateType} onChange={(event) => setUpdateType(event.target.value)}>
          <option value="General Update">General Update</option>
          <option value="Service Change">Service Change</option>
          <option value="Price Change">Price Change</option>
          <option value="Missed Cleaning">Missed Cleaning</option>
          <option value="Schedule Change">Schedule Change</option>
          <option value="Key / Alarm Update">Key / Alarm Update</option>
          <option value="Subcontractor Update">Subcontractor Update</option>
          <option value="Customer Note">Customer Note</option>
          <option value="Other">Other</option>
        </SelectField>
        <Field label="Manager" value={manager} onChange={(event) => setManager(event.target.value)} placeholder="Andrés, Greg, Drew..." />
        <TextAreaField
          label="Notes"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Write the account update here..."
        />
        <Field
          label="Notify email"
          optional
          type="email"
          value={notifyEmail}
          onChange={(event) => setNotifyEmail(event.target.value)}
          placeholder="Optional email notification"
        />

        {saveMessage ? <ErrorBox title="The update was not saved." text={saveMessage} /> : null}
      </Sheet>
    </Screen>
  );
}

export default function AccountUpdatesPage() {
  return (
    <Suspense
      fallback={
        <div className="ui-screen">
          <SkeletonList rows={3} />
        </div>
      }
    >
      <AccountUpdatesPageContent />
    </Suspense>
  );
}
