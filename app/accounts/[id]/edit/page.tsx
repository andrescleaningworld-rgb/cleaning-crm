"use client";

import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BigButton, Card, EmptyState, ErrorBox, Field, Screen, SelectField, showToast, SkeletonList, TextAreaField } from "@/app/ui";
import GoogleAddressAutocompleteInput, {
  type PlaceAddressDetails,
} from "@/app/components/GoogleAddressAutocompleteInput";

type Account = {
  id?: string;
  accountId?: string;
  rowNumber?: number;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: string;
  longitude?: string;
  manager?: string;
  subcontractor?: string;
  status?: string;
  accountStartDate?: string;
  startDate?: string;
  serviceStartDate?: string;
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
  checklistNeeded?: string;
};

type Subcontractor = {
  id?: string;
  subcontractorId?: string;
  name?: string;
  subcontractor?: string;
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  displayName?: string;
  dropdownLabel?: string;
  email?: string;
  status?: string;
};

type SubcontractorOption = {
  value: string;
  label: string;
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: Subcontractor[];
  subs?: Subcontractor[];
  data?: Subcontractor[];
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function getSubcontractorDisplayName(subcontractor: Subcontractor) {
  const contactName = cleanText(
    subcontractor.contactName ||
      subcontractor.name ||
      subcontractor.subcontractorName
  );

  const companyName = cleanText(
    subcontractor.companyName || subcontractor.subcontractor
  );

  if (contactName && companyName) {
    return `${contactName} — ${companyName}`;
  }

  return (
    cleanText(subcontractor.displayName) ||
    cleanText(subcontractor.dropdownLabel) ||
    contactName ||
    companyName ||
    cleanText(subcontractor.email)
  );
}

// Company name alone isn't unique (multiple subs can share one, e.g.
// "Cleaning World"), which caused duplicate React keys and ambiguous
// dropdown selections. Subcontractor ID (column A of the Subcontractors
// tab) is the true unique identifier — email isn't safe to lead with here
// since two different subs can share a contact inbox (e.g. two companies
// both using "contact.clcleaning@gmail.com"), which caused both the
// duplicate-key warning and a silent mismatch in resolveSubcontractorForSubmit
// below. This is used purely to key/select the dropdown option — NOT as
// what gets written to the sheet. See getSubcontractorSubmitName for that.
function getSubcontractorDropdownValue(subcontractor: Subcontractor) {
  return cleanText(
    subcontractor.id ||
      subcontractor.subcontractorId ||
      subcontractor.email ||
      getSubcontractorDisplayName(subcontractor)
  );
}

// What actually gets saved to the Accounts sheet's Subcontractor column —
// column B (Contact Name) of the Subcontractors tab, rather than the email
// used above to key the dropdown.
function getSubcontractorSubmitName(subcontractor: Subcontractor) {
  const contactName = cleanText(
    subcontractor.contactName ||
      subcontractor.name ||
      subcontractor.subcontractorName
  );
  return contactName || getSubcontractorDisplayName(subcontractor);
}

function resolveSubcontractorForSubmit(
  selectedValue: unknown,
  subcontractors: Subcontractor[]
) {
  const trimmed = cleanText(selectedValue);
  if (!trimmed) return trimmed;

  const match = subcontractors.find(
    (subcontractor) => getSubcontractorDropdownValue(subcontractor) === trimmed
  );

  return match ? getSubcontractorSubmitName(match) : trimmed;
}

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

// Mirrors app/accounts/new/page.tsx's computeSuggestedSubcontractorPay
// (same 0.7 ratio) — that auto-calc was never ported to this Edit form at
// all, which is the root cause of "changing Cleaning World Gets Paid
// doesn't recalculate Subcontractor Pay" here.
function computeSuggestedSubcontractorPay(revenueInput: string) {
  const numericRevenue = moneyToNumber(revenueInput);

  if (!numericRevenue || numericRevenue <= 0) {
    return "";
  }

  return String(Math.round(numericRevenue * 0.7 * 100) / 100);
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

export default function EditAccountPage() {
  const params = useParams();
  const rawAccountIdFromUrl = String(params?.id || "");
  const decodedAccountIdFromUrl = decodeURIComponent(rawAccountIdFromUrl);
  const normalizedUrlValue = normalizeValue(decodedAccountIdFromUrl);

  const [formData, setFormData] = useState<Account | null>(null);
  // Snapshot of the account as loaded, kept separate from formData so a
  // submit can tell which fields the user actually changed in this form
  // vs. which were merely carried along from a possibly-stale page load.
  const originalDataRef = useRef<Account | null>(null);
  // Crew Link modules (docs/crew-link-spec.md) — saved to Postgres through
  // /api/checklist-templates, separate from the Sheets account fields.
  const [crewLinkModules, setCrewLinkModules] = useState({ supplyOrders: false, problemReports: false });
  const originalCrewLinkModulesRef = useRef({ supplyOrders: false, problemReports: false });
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubcontractors, setLoadingSubcontractors] = useState(true);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  // Starts false on every load (including an account that already has a
  // saved Subcontractor Pay) so opening the form never recalculates
  // anything on its own — only an actual edit to Cleaning World Gets Paid
  // (while untouched) or a direct edit to Subcontractor Pay itself (which
  // flips this and stops further auto-overwrites) changes the value.
  const [subcontractorPayTouched, setSubcontractorPayTouched] = useState(false);

  useEffect(() => {
    async function loadAccount() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const data = await readJsonResponse<{
          success?: boolean;
          error?: string;
          accounts?: Account[];
          data?: Account[];
        }>(response);

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
            String(item.accountId || item.id || "") ===
              decodedAccountIdFromUrl ||
            String(item.rowNumber || "") === decodedAccountIdFromUrl ||
            String(item.accountName || "") === decodedAccountIdFromUrl
          );
        });

        if (!foundAccount) {
          throw new Error(
            "This account does not exist or the account link is incorrect."
          );
        }

        // "Checklist Needed" is read via the direct-Sheets path (see
        // lib/googleSheets.ts's getMainAccountById), not the Apps-Script
        // account object above — best-effort, defaults to "No" if this
        // fetch fails rather than blocking the rest of the page load.
        let checklistNeeded = "No";
        try {
          const accountIdForChecklist =
            foundAccount.accountId || foundAccount.id || "";
          if (accountIdForChecklist) {
            const checklistResp = await fetch(
              `/api/checklist-templates?accountId=${encodeURIComponent(String(accountIdForChecklist))}`,
              { cache: "no-store" }
            );
            const checklistData = await readJsonResponse<{
              checklistNeeded?: boolean;
              template?: { supplyOrdersEnabled?: boolean; problemReportsEnabled?: boolean } | null;
            }>(checklistResp);
            if (checklistResp.ok && checklistData.checklistNeeded) {
              checklistNeeded = "Yes";
            }
            if (checklistResp.ok) {
              const modules = {
                supplyOrders: checklistData.template?.supplyOrdersEnabled === true,
                problemReports: checklistData.template?.problemReportsEnabled === true,
              };
              setCrewLinkModules(modules);
              originalCrewLinkModulesRef.current = modules;
            }
          }
        } catch {
          // Best-effort only — leave default "No" if this lookup fails.
        }

        const accountWithChecklist: Account = { ...foundAccount, checklistNeeded };
        setFormData(accountWithChecklist);
        originalDataRef.current = accountWithChecklist;
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

    async function loadSubcontractors() {
      try {
        setLoadingSubcontractors(true);

        const response = await fetch("/api/subcontractors", {
          cache: "no-store",
        });

        const data = await readJsonResponse<SubcontractorsApiResponse>(
          response
        );

        if (!response.ok || data.success === false) {
          return;
        }

        setSubcontractors(data.subcontractors || data.subs || data.data || []);
      } catch {
        // Do not block the edit form if subcontractors fail to load.
      } finally {
        setLoadingSubcontractors(false);
      }
    }

    loadAccount();
    loadSubcontractors();
  }, [decodedAccountIdFromUrl, normalizedUrlValue]);

  const subcontractorOptions = useMemo<SubcontractorOption[]>(() => {
    const currentValue = cleanText(formData?.subcontractor);

    const options = subcontractors
      .map((subcontractor) => ({
        value: getSubcontractorDropdownValue(subcontractor),
        label: getSubcontractorDisplayName(subcontractor),
      }))
      .filter((option) => option.value && option.label);

    const alreadyHasCurrentValue = options.some(
      (option) => option.value === currentValue
    );

    if (currentValue && !alreadyHasCurrentValue) {
      options.push({
        value: currentValue,
        label: currentValue,
      });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [subcontractors, formData?.subcontractor]);

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

  function handlePlaceSelected(details: PlaceAddressDetails) {
    setFormData((current) => {
      if (!current) return current;

      return {
        ...current,
        address: details.address,
        city: details.city,
        state: details.state,
        zip: details.zip,
        latitude: details.latitude,
        longitude: details.longitude,
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

    const cleanStartDate = cleanText(
      formData.accountStartDate || formData.startDate || formData.serviceStartDate
    );

    try {
      setSaving(true);
      setSaveError("");
      setSavedMessage("");

      const original = originalDataRef.current;

      // Only send fields this form actually changed, merged server-side onto
      // a fresh account read — not everything this page happened to load
      // when it was first opened. Otherwise a tab left open for a while
      // silently reverts someone else's more recent edit to a field this
      // form never touched (a "lost update" — the edits looked saved but a
      // later stale submit quietly wiped them).
      const fields: Partial<Account> = {};
      (Object.keys(formData) as (keyof Account)[]).forEach((key) => {
        if (key === "id" || key === "accountId" || key === "rowNumber") return;
        if (formData[key] !== original?.[key]) {
          fields[key] = formData[key];
        }
      });

      // These are always derived/normalized from the form's own inputs, so
      // always resend them rather than relying on the plain diff above.
      fields.accountStartDate = cleanStartDate;
      fields.startDate = cleanStartDate;
      fields.serviceStartDate = cleanStartDate;
      fields.subcontractor = resolveSubcontractorForSubmit(
        formData.subcontractor,
        subcontractors
      );
      fields.grossMargin = String(grossMargin);
      fields.grossMarginPercent = grossMarginPercent.toFixed(1);

      // Direct-Sheets write (bypasses Apps Script entirely) — see
      // updateAccountFieldsDirect's comment in lib/googleSheets.ts. The old
      // action:"updateAccountFields" path did two sequential Apps Script
      // round trips per save and was routinely hitting its 18s timeout.
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateAccountFieldsDirect",
          accountId: formData.id || formData.accountId,
          fields,
        }),
      });

      const data = await readJsonResponse<{
        success?: boolean;
        error?: string;
        checklistFlagWarning?: string | null;
      }>(response);

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not update account.");
      }

      originalDataRef.current = { ...original, ...fields };

      let crewLinkWarning = "";
      const originalModules = originalCrewLinkModulesRef.current;
      if (
        crewLinkModules.supplyOrders !== originalModules.supplyOrders ||
        crewLinkModules.problemReports !== originalModules.problemReports
      ) {
        try {
          const modulesResponse = await fetch("/api/checklist-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "setCrewLinkModules",
              accountId: formData.accountId || formData.id,
              accountName: formData.accountName,
              ...crewLinkModules,
            }),
          });
          const modulesData = await readJsonResponse<{ success?: boolean; error?: string }>(modulesResponse);
          if (!modulesResponse.ok || !modulesData.success) throw new Error(modulesData.error || "failed");
          originalCrewLinkModulesRef.current = { ...crewLinkModules };
        } catch {
          crewLinkWarning = " Crew Link supply orders / problem reports could not be saved — try again.";
        }
      }

      // Green message for the save itself; if "Checklist Needed" or the Crew
      // Link switches did not save, that part stays on screen in a box.
      showToast("Account saved");
      setSavedMessage(((data.checklistFlagWarning || "") + crewLinkWarning).trim());
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
      <Screen title="Edit Account" backHref="/accounts">
        <SkeletonList rows={4} />
      </Screen>
    );
  }

  if (error || !formData) {
    return (
      <Screen title="Account Not Found" backHref="/accounts">
        <EmptyState
          title="We could not find this account"
          text={error || "This account does not exist or the account link is incorrect."}
          action={
            <BigButton kind="second" href="/accounts">
              Back to accounts
            </BigButton>
          }
        />
      </Screen>
    );
  }

  const sectionStyle = { display: "flex", flexDirection: "column", gap: 16, marginTop: 12 } as const;

  return (
    <Screen
      title="Edit Account"
      subtitle={formData.accountName || "this account"}
      backHref={`/accounts/${accountIdForUrl}`}
      action={
        <BigButton type="submit" form="edit-account-form" busy={saving} busyLabel="Saving…">
          Save changes
        </BigButton>
      }
      secondaryAction={
        <BigButton kind="quiet" href={`/accounts/${accountIdForUrl}`} disabled={saving}>
          Cancel
        </BigButton>
      }
    >
      {saveError ? <ErrorBox title="Your changes were not saved." text={saveError} /> : null}
      {savedMessage ? <ErrorBox title="Saved, but one part did not save." text={savedMessage} /> : null}

      <div className="ui-stats">
        <div className="ui-stat">
          <p className="ui-stat-label">Cleaning World Gets Paid</p>
          <p className="ui-stat-value">{formatCurrency(formData.monthlyRevenue)}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Subcontractor Pay</p>
          <p className="ui-stat-value">{formatCurrency(formData.subcontractorPay || formData.monthlySubcontractorPay)}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Gross Margin</p>
          <p className="ui-stat-value">{formatCurrency(String(grossMargin))}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Gross Margin %</p>
          <p className="ui-stat-value">{grossMarginPercent.toFixed(1)}%</p>
        </div>
      </div>

      <form id="edit-account-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card title="Basic Account Information">
          <div style={sectionStyle}>
            <Field label="Account name" optional value={formData.accountName || ""} onChange={(event) => updateField("accountName", event.target.value)} />

            <SelectField label="Status" optional value={formData.status || ""} onChange={(event) => updateField("status", event.target.value)}>
              <option value="">Select Status</option>
              <option value="Active">Active</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Paused">Paused</option>
              <option value="Over 90 Days">Over 90 Days</option>
              <option value="Inactive">Inactive</option>
            </SelectField>

            <Field
              label="Start date"
              optional
              placeholder="6/10/2026"
              value={formData.accountStartDate || formData.startDate || formData.serviceStartDate || ""}
              onChange={(event) => {
                // Written to all three aliases (the read side already
                // falls back between them, meaning existing data can
                // land under any one name) so a manual edit can't end up
                // saved under a field the load path isn't preferring —
                // same fix as Subcontractor Pay below, which hits the
                // same class of bug: without this, accountStartDate
                // (read first) stays at its stale loaded value and masks
                // every keystroke on the next render, so the field looks
                // impossible to edit.
                const value = event.target.value;
                setFormData((current) =>
                  current
                    ? {
                        ...current,
                        accountStartDate: value,
                        startDate: value,
                        serviceStartDate: value,
                      }
                    : current
                );
                setSavedMessage("");
                setSaveError("");
              }}
            />

            <Field
              label="Cancelled date"
              optional
              placeholder="6/10/2026"
              value={formData.cancelledDate || ""}
              onChange={(event) => updateField("cancelledDate", event.target.value)}
            />

            <SelectField label="Account health" optional value={formData.accountHealth || ""} onChange={(event) => updateField("accountHealth", event.target.value)}>
              <option value="">Select Account Health</option>
              <option value="Stable">Stable</option>
              <option value="Needs Attention">Needs Attention</option>
              <option value="High Risk">High Risk</option>
            </SelectField>

            <label className="ui-field">
              <span className="ui-label">
                Address <span className="ui-optional">(optional)</span>
              </span>
              <span className="ui-hint">
                Start typing and pick a suggestion. City, state, and zip are filled in automatically and do not need to be
                entered separately.
              </span>
              <GoogleAddressAutocompleteInput
                value={formData.address || ""}
                onChange={(value) => updateField("address", value)}
                onPlaceSelected={handlePlaceSelected}
                className="ui-input"
              />
            </label>
          </div>
        </Card>

        <Card title="Service & Assignment">
          <div style={sectionStyle}>
            <Field label="Manager" optional value={formData.manager || ""} onChange={(event) => updateField("manager", event.target.value)} />

            <SelectField
              label="Assigned subcontractor"
              optional
              hint={
                !loadingSubcontractors && subcontractorOptions.length === 0
                  ? undefined
                  : "Subcontractor must come from the existing subcontractor list."
              }
              error={
                !loadingSubcontractors && subcontractorOptions.length === 0
                  ? "No subcontractors were found. Add the subcontractor first from the Subcontractors page."
                  : undefined
              }
              value={formData.subcontractor || ""}
              onChange={(event) => updateField("subcontractor", event.target.value)}
              disabled={loadingSubcontractors}
            >
              <option value="">{loadingSubcontractors ? "Loading subcontractors…" : "Select subcontractor"}</option>
              {subcontractorOptions.map((subcontractor) => (
                <option key={subcontractor.value} value={subcontractor.value}>
                  {subcontractor.label}
                </option>
              ))}
            </SelectField>

            <Field label="Service type" optional value={formData.serviceType || ""} onChange={(event) => updateField("serviceType", event.target.value)} />
            <Field label="Frequency" optional value={formData.frequency || ""} onChange={(event) => updateField("frequency", event.target.value)} />
            <Field
              label="Cleaning days"
              optional
              placeholder="Mon, Wed, Fri"
              value={formData.cleaningDays || ""}
              onChange={(event) => updateField("cleaningDays", event.target.value)}
            />
          </div>
        </Card>

        <Card title="Billing & Pay">
          <div style={sectionStyle}>
            <Field
              label="Cleaning World gets paid"
              optional
              inputMode="decimal"
              value={formData.monthlyRevenue || ""}
              onChange={(event) => {
                const value = event.target.value;
                setFormData((current) => {
                  if (!current) return current;
                  const suggestedPay = subcontractorPayTouched
                    ? undefined
                    : computeSuggestedSubcontractorPay(value);
                  return {
                    ...current,
                    monthlyRevenue: value,
                    ...(suggestedPay !== undefined
                      ? { subcontractorPay: suggestedPay, monthlySubcontractorPay: suggestedPay }
                      : {}),
                  };
                });
                setSavedMessage("");
                setSaveError("");
              }}
            />

            <Field
              label="Subcontractor pay"
              optional
              hint="Changes to 70% of the amount above when you edit that, until you type your own number here."
              inputMode="decimal"
              value={formData.subcontractorPay || formData.monthlySubcontractorPay || ""}
              onChange={(event) => {
                // Marks this touched so a later Cleaning World Gets Paid
                // edit stops overwriting it — this is now the user's
                // deliberate value, not a suggestion. Written to both
                // subcontractorPay and monthlySubcontractorPay (the read
                // side already falls back between the two, meaning
                // existing data can land under either name) so a manual
                // edit can't end up saved under the field the load path
                // isn't preferring, which would look like the edit
                // silently didn't take.
                const value = event.target.value;
                setSubcontractorPayTouched(true);
                setFormData((current) =>
                  current
                    ? { ...current, subcontractorPay: value, monthlySubcontractorPay: value }
                    : current
                );
                setSavedMessage("");
                setSaveError("");
              }}
            />
          </div>
        </Card>

        <Card title="Customer Contact">
          <div style={sectionStyle}>
            <Field label="Contact name" optional value={formData.contactName || ""} onChange={(event) => updateField("contactName", event.target.value)} />
            <Field label="Phone" optional inputMode="tel" value={formData.phone || ""} onChange={(event) => updateField("phone", event.target.value)} />
            <Field label="Email" optional inputMode="email" value={formData.email || ""} onChange={(event) => updateField("email", event.target.value)} />
          </div>
        </Card>

        <Card title="Access Information">
          <div style={sectionStyle}>
            <SelectField label="Has key?" optional value={formData.hasKey || ""} onChange={(event) => updateField("hasKey", event.target.value)}>
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </SelectField>

            <fieldset className="ui-checks">
              <legend className="ui-label">Crew Link</legend>
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={formData.checklistNeeded === "Yes"}
                  onChange={(event) => updateField("checklistNeeded", event.target.checked ? "Yes" : "No")}
                />
                <span>Checklist</span>
              </label>
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={crewLinkModules.supplyOrders}
                  onChange={(event) => setCrewLinkModules((m) => ({ ...m, supplyOrders: event.target.checked }))}
                />
                <span>Supply orders</span>
              </label>
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={crewLinkModules.problemReports}
                  onChange={(event) => setCrewLinkModules((m) => ({ ...m, problemReports: event.target.checked }))}
                />
                <span>Problem reports</span>
              </label>
            </fieldset>

            <Field
              label="Alarm code / instructions"
              optional
              value={formData.alarmCode || ""}
              onChange={(event) => updateField("alarmCode", event.target.value)}
            />

            <TextAreaField
              label="Key / Alarm / Access Info"
              optional
              rows={3}
              value={formData.keyAlarmAccessInfo || ""}
              onChange={(event) => updateField("keyAlarmAccessInfo", event.target.value)}
            />
          </div>
        </Card>

        <Card title="Scope of Work">
          <div style={sectionStyle}>
            <TextAreaField
              label="Scope of work"
              optional
              rows={6}
              value={formData.scopeOfWork || ""}
              onChange={(event) => updateField("scopeOfWork", event.target.value)}
            />
          </div>
        </Card>

        <Card title="Notes">
          <div style={sectionStyle}>
            <TextAreaField label="Notes" optional rows={5} value={formData.notes || ""} onChange={(event) => updateField("notes", event.target.value)} />
          </div>
        </Card>

        <Card title="Change History">
          <p className="ui-card-text">
            Every saved change is listed under History on the account page.
          </p>
          <div style={{ marginTop: 12 }}>
            <BigButton kind="second" href={`/accounts/${accountIdForUrl}`}>
              Open the account page
            </BigButton>
          </div>
        </Card>
      </form>
    </Screen>
  );
}
