"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PinSwitch, pinAfterSave, startingPin, usePinInfo, type PinChoice } from "../../components/pin-to-board";
import { BigButton, ErrorBox, Field, Screen, SelectField, SkeletonList, TextAreaField } from "@/app/ui";

type Account = {
  id?: string;
  accountId?: string;
  accountName?: string;
  manager?: string;
  subcontractor?: string;
};

type AccountsApiResponse = {
  success?: boolean;
  error?: string;
  accounts?: Account[];
  data?: Account[];
};

type SaveVisitResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  /** The new visit's id. */
  id?: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getLoadedAccounts(data: AccountsApiResponse | Account[]): Account[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.accounts)) return data.accounts;
  if (Array.isArray(data.data)) return data.data;
  return [];
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
  // "Pin to board": starts as Settings says, in the square of the manager who made the visit.
  const { info: pinInfo } = usePinInfo();
  const [pinPicked, setPinPicked] = useState<PinChoice | null>(null);
  const pinChoice = pinPicked ?? startingPin(pinInfo, "visit", manager);
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
        let data: AccountsApiResponse | Account[];

        try {
          data = JSON.parse(text) as AccountsApiResponse | Account[];
        } catch {
          throw new Error("Accounts API did not return valid JSON.");
        }

        if (!response.ok || (!Array.isArray(data) && data.success === false)) {
          throw new Error(
            !Array.isArray(data) && data.error
              ? data.error
              : "Failed to load accounts."
          );
        }

        const loadedAccounts = getLoadedAccounts(data);

        setAccounts(loadedAccounts);

        if (accountFromUrl || accountIdFromUrl) {
          const matchingAccount = loadedAccounts.find((account) => {
            return (
              clean(account.accountName) === accountFromUrl ||
              clean(account.id) === accountIdFromUrl ||
              clean(account.accountId) === accountIdFromUrl
            );
          });

          if (matchingAccount) {
            setAccountName(clean(matchingAccount.accountName));
            setManager(clean(matchingAccount.manager));
            setSubcontractor(clean(matchingAccount.subcontractor));
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error loading accounts."
        );
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

  async function handleSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

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
      let data: SaveVisitResponse;

      try {
        data = JSON.parse(text) as SaveVisitResponse;
      } catch {
        throw new Error("Visits API did not return valid JSON while saving.");
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to save visit.");
      }

      await pinAfterSave(pinInfo, "visit", pinChoice, { recordId: clean(data.id), title: [visitType, accountName].filter(Boolean).join(" · "), accountName });

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
    <Screen
      title="Add visit"
      subtitle="Save an account visit, condition score, notes, and follow-up information."
      backHref="/visits"
      action={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void handleSubmit()}>
          Save visit
        </BigButton>
      }
    >
      {message ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {message}
        </p>
      ) : null}
      {error ? <ErrorBox title="That did not work." text={error} /> : null}

      <form onSubmit={handleSubmit} className="ui-screen-body" noValidate>
        <Field label="Visit date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        <Field
          label="Account"
          hint="Type a few letters, then pick the account from the list."
          list="account-list"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder={loadingAccounts ? "Loading accounts…" : "Search or type account name"}
        />
        <datalist id="account-list">
          {accounts.map((account, index) => (
            <option key={`${account.id || account.accountName || "account"}-${index}`} value={clean(account.accountName)} />
          ))}
        </datalist>

        <Field label="Manager / visited by" optional value={manager} onChange={(event) => setManager(event.target.value)} placeholder="Manager" />
        <Field label="Subcontractor" optional value={subcontractor} onChange={(event) => setSubcontractor(event.target.value)} placeholder="Subcontractor" />

        <SelectField label="Visit type" value={visitType} onChange={(event) => setVisitType(event.target.value)}>
          <option>Routine Visit</option>
          <option>Complaint Follow-Up</option>
          <option>Quality Check</option>
          <option>Onboarding New Account</option>
          <option>Customer Request</option>
          <option>Subcontractor Review</option>
          <option>Other</option>
        </SelectField>

        <SelectField label="Condition score 0-10" value={condition} onChange={(event) => setCondition(event.target.value)}>
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
        </SelectField>

        <SelectField label="Follow-up needed" value={followUpNeeded} onChange={(event) => setFollowUpNeeded(event.target.value)}>
          <option>No</option>
          <option>Yes</option>
        </SelectField>

        <Field label="Follow-up date" optional type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />

        <TextAreaField
          label="Notes"
          optional
          rows={6}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Write visit notes, issues found, customer feedback, or follow-up details..."
        />

        <PinSwitch info={pinInfo} type="visit" value={pinChoice} onChange={setPinPicked} disabled={saving} />
      </form>
    </Screen>
  );
}

export default function NewVisitPage() {
  return (
    <Suspense
      fallback={
        <div className="ui-screen">
          <SkeletonList rows={3} />
        </div>
      }
    >
      <NewVisitPageContent />
    </Suspense>
  );
}
