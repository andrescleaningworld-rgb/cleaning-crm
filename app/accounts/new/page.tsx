"use client";

import { BigButton, Card, ErrorBox, Field, Screen, SelectField, showToast, StatusPill, TextAreaField } from "@/app/ui";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import GoogleAddressAutocompleteInput, {
  type PlaceAddressDetails,
} from "@/app/components/GoogleAddressAutocompleteInput";
import { distanceInMiles, formatMiles } from "@/app/lib/distance";

type AccountForm = {
  accountName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
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
  checklistNeeded: string;
};

type Manager = {
  sheetRow?: number;
  managerId?: string;
  name?: string;
  phone?: string;
  status?: string;
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
  score?: string;
  scoreStatus?: string;
};

// Minimal shape pulled from the plain /api/accounts (getAllAccounts) list —
// same fields/casing app/accounts/page.tsx already reads directly off that
// response (see its Account type) — just enough to infer each subcontractor's
// approximate location from their nearest currently-serviced account, since
// subcontractors themselves don't carry a reliable geocoded address (their
// free-text address field is often blank/a mailing address — see
// app/sub-center/coverage-map.tsx's findClosestSubs comment for the same
// reasoning applied there).
type ProximityAccount = {
  subcontractor?: string;
  status?: string;
  latitude?: string | number;
  longitude?: string | number;
};

// Same tier values as app/accounts/page.tsx's NEAR_ACCOUNT_RADIUS_OPTIONS
// ("Near Account" filter), applied here as an expanding search instead of a
// manually-picked radius: try the tightest radius first and widen only if
// nothing qualifies yet.
const SUGGESTION_RADIUS_TIERS_MILES = [5, 10, 25, 50] as const;

// Threshold for the "Below target score" badge: the score value below which
// lib/googleSheets.ts's getSubcontractorPerformanceMap stops labeling a sub
// "Good" and starts labeling them "Needs Attention" (see the scoreStatus
// if-chain there, mirrored in app/subcontractors/[id]/page.tsx's score
// legend: "8-8.9 Good, 7-7.9 Needs Attention"). Reused as-is rather than
// inventing a new "at risk" number.
const AT_RISK_SCORE_THRESHOLD = 8;

// Mirrors coverage.tsx / coverage-map.tsx's isServicedStatus (each of those
// already keeps its own local copy rather than sharing one — same pattern
// followed here rather than introducing a new shared export).
function isServicedStatus(status: unknown): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return true;
  if (value.includes("cancel") || value.includes("lost") || value.includes("terminated") || value.includes("closed")) {
    return false;
  }
  if (value.includes("pause") || value.includes("hold") || value.includes("suspended")) return false;
  if (value.includes("90") || value.includes("over ninety") || value.includes("old")) return false;
  return true;
}

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

type SaveAccountResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  accountId?: string;
  checklistFlagWarning?: string | null;
};

const emptyForm: AccountForm = {
  accountName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  latitude: "",
  longitude: "",
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
  checklistNeeded: "No",
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

function computeSuggestedSubcontractorPay(revenueInput: string) {
  const numericRevenue = Number(revenueInput.replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(numericRevenue) || numericRevenue <= 0) {
    return "";
  }

  return String(Math.round(numericRevenue * 0.7 * 100) / 100);
}

export default function NewAccountPage() {
  const router = useRouter();

  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [portalAccess, setPortalAccess] = useState<"Yes" | "No">("Yes");
  const [managers, setManagers] = useState<Manager[]>([]);
  const [subcontractorPayTouched, setSubcontractorPayTouched] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(true);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingSubcontractors, setLoadingSubcontractors] = useState(true);
  const [error, setError] = useState("");
  const [proximityAccounts, setProximityAccounts] = useState<ProximityAccount[]>([]);

  useEffect(() => {
    async function loadManagers() {
      try {
        setLoadingManagers(true);

        const response = await fetch("/api/admin/managers", {
          cache: "no-store",
        });

        const data = await readJsonResponse<Manager[] | { error?: string }>(
          response
        );

        if (!response.ok || !Array.isArray(data)) return;

        setManagers(data);
      } catch {
        // Do not block the form if manager options fail to load.
      } finally {
        setLoadingManagers(false);
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

        setSubcontractors(
          data.subcontractors || data.subs || data.data || []
        );
      } catch {
        // Do not block the full form if subcontractors fail to load.
      } finally {
        setLoadingSubcontractors(false);
      }
    }

    // Powers the nearest-subcontractor suggestion note only — read-only,
    // fails silently like managers/subcontractors above so it never blocks
    // the form itself.
    async function loadProximityAccounts() {
      try {
        const response = await fetch("/api/accounts", { cache: "no-store" });

        const data = await readJsonResponse<{
          success?: boolean;
          accounts?: ProximityAccount[];
        }>(response);

        if (!response.ok || data.success === false) return;

        setProximityAccounts(data.accounts || []);
      } catch {
        // Suggestion note simply won't show if this fails.
      }
    }

    loadManagers();
    loadSubcontractors();
    loadProximityAccounts();
  }, []);

  const managerOptions = useMemo(() => {
    return Array.from(
      new Set(
        managers
          .map((manager) => cleanText(manager.name))
          .filter(Boolean)
      )
    ).sort();
  }, [managers]);

  const subcontractorOptions = useMemo<SubcontractorOption[]>(() => {
    return subcontractors
      .map((subcontractor) => ({
        value: getSubcontractorDropdownValue(subcontractor),
        label: getSubcontractorDisplayName(subcontractor),
      }))
      .filter((option) => option.value && option.label)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subcontractors]);

  // Informational only — never writes to form.subcontractor. Reuses the same
  // form.latitude/form.longitude the Full Address autocomplete already
  // resolves (handlePlaceSelected below), the shared Haversine util, and the
  // severity-weighted score already merged onto `subcontractors` by
  // /api/subcontractors. See SUGGESTION_RADIUS_TIERS_MILES/AT_RISK_SCORE_THRESHOLD
  // above for where those reused values come from.
  const suggestedSubcontractor = useMemo(() => {
    const originLatitude = Number(form.latitude);
    const originLongitude = Number(form.longitude);

    if (
      !form.latitude ||
      !form.longitude ||
      !Number.isFinite(originLatitude) ||
      !Number.isFinite(originLongitude)
    ) {
      return null;
    }

    // A subcontractor has no reliable geocoded home address of their own
    // (see ProximityAccount's comment above), so their location is inferred
    // from the single nearest currently-serviced account already assigned to
    // them — same approach app/sub-center/coverage-map.tsx's findClosestSubs
    // uses for the same reason.
    const nearestDistanceBySub = new Map<string, number>();

    for (const account of proximityAccounts) {
      const subName = cleanText(account.subcontractor);
      if (!subName || subName.toLowerCase() === "unassigned") continue;
      if (!isServicedStatus(account.status)) continue;

      const accountLatitude = Number(account.latitude);
      const accountLongitude = Number(account.longitude);
      if (!Number.isFinite(accountLatitude) || !Number.isFinite(accountLongitude)) {
        continue;
      }

      const distance = distanceInMiles(
        { latitude: originLatitude, longitude: originLongitude },
        { latitude: accountLatitude, longitude: accountLongitude }
      );
      if (distance === null) continue;

      const existing = nearestDistanceBySub.get(subName);
      if (existing === undefined || distance < existing) {
        nearestDistanceBySub.set(subName, distance);
      }
    }

    let candidates: Array<{ name: string; distance: number }> = [];
    for (const radius of SUGGESTION_RADIUS_TIERS_MILES) {
      candidates = Array.from(nearestDistanceBySub.entries())
        .filter(([, distance]) => distance <= radius)
        .map(([name, distance]) => ({ name, distance }));
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.distance - b.distance);
    const closest = candidates[0];

    const matchedSubcontractor = subcontractors.find(
      (subcontractor) =>
        getSubcontractorSubmitName(subcontractor).toLowerCase() ===
        closest.name.toLowerCase()
    );
    if (!matchedSubcontractor?.score) return null;

    const numericScore = Number(matchedSubcontractor.score);
    if (!Number.isFinite(numericScore)) return null;

    return {
      name: closest.name,
      distanceLabel: formatMiles(closest.distance),
      scoreLabel: matchedSubcontractor.score,
      isAtRisk: numericScore < AT_RISK_SCORE_THRESHOLD,
    };
  }, [form.latitude, form.longitude, proximityAccounts, subcontractors]);

  function updateField(field: keyof AccountForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handlePlaceSelected(details: PlaceAddressDetails) {
    setForm((current) => ({
      ...current,
      address: details.address,
      city: details.city,
      state: details.state,
      zip: details.zip,
      latitude: details.latitude,
      longitude: details.longitude,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      if (!form.accountName.trim()) {
        throw new Error("Account name is required.");
      }

      const accountPayload: AccountForm = {
        ...form,
        accountName: form.accountName.trim(),
        address: form.address.trim(),
        manager: form.manager.trim(),
        subcontractor: resolveSubcontractorForSubmit(
          form.subcontractor,
          subcontractors
        ),
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

      if (portalAccess === "Yes") {
        try {
          await fetch("/api/admin/portal-accounts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              accountName: accountPayload.accountName,
              phone: accountPayload.phone,
              accountId: data.accountId || "",
            }),
          });
        } catch {
          // Do not block account creation if the portal access row could not be created.
        }
      }

      // A "Checklist Needed" warning is not a failure: the account is saved.
      showToast(data.checklistFlagWarning || "Account saved", data.checklistFlagWarning ? "bad" : "good");

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

  const sectionStyle = { display: "flex", flexDirection: "column", gap: 16, marginTop: 12 } as const;

  return (
    <Screen
      title="Add New Account"
      subtitle="Use the full address in one field."
      backHref="/accounts"
      action={
        <BigButton type="submit" form="new-account-form" busy={saving} busyLabel="Saving…">
          Save account
        </BigButton>
      }
      secondaryAction={
        <BigButton kind="quiet" href="/accounts" disabled={saving}>
          Cancel
        </BigButton>
      }
    >
      {error ? <ErrorBox title="The account was not saved." text={error} /> : null}

      <form id="new-account-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card title="Account Information">
          <div style={sectionStyle}>
            <Field
              label="Account name"
              value={form.accountName}
              onChange={(event) => updateField("accountName", event.target.value)}
              required
            />

            <SelectField label="Status" value={form.status} onChange={(event) => updateField("status", event.target.value)}>
              <option>Active</option>
              <option>Paused</option>
              <option>Over 90 Days</option>
              <option>Cancelled</option>
            </SelectField>

            <Field
              label="Account start date"
              type="date"
              optional
              value={form.accountStartDate}
              onChange={(event) => updateField("accountStartDate", event.target.value)}
            />

            <SelectField label="Account health" value={form.accountHealth} onChange={(event) => updateField("accountHealth", event.target.value)}>
              <option>Stable</option>
              <option>Needs Attention</option>
              <option>High Risk</option>
            </SelectField>

            <SelectField
              label="Portal access"
              hint="Yes lets this customer use the customer portal."
              value={portalAccess}
              onChange={(event) => setPortalAccess(event.target.value as "Yes" | "No")}
            >
              <option>Yes</option>
              <option>No</option>
            </SelectField>

            <label className="ui-field">
              <span className="ui-label">
                Full address <span className="ui-optional">(optional)</span>
              </span>
              <span className="ui-hint">
                Start typing and pick a suggestion, or paste the full address from Google Maps. City, state, and zip do
                not need to be entered separately.
              </span>
              <GoogleAddressAutocompleteInput
                value={form.address}
                onChange={(value) => updateField("address", value)}
                onPlaceSelected={handlePlaceSelected}
                placeholder="1010 Kendal Way, Tarrytown, NY 10591, USA"
                className="ui-input"
              />
            </label>
          </div>
        </Card>

        <Card title="Assignment & Pricing">
          <div style={sectionStyle}>
            <SelectField
              label="Manager"
              optional
              value={form.manager}
              onChange={(event) => updateField("manager", event.target.value)}
              disabled={loadingManagers}
            >
              <option value="">{loadingManagers ? "Loading managers…" : "Select manager"}</option>
              {managerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Subcontractor"
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
              value={form.subcontractor}
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

            {suggestedSubcontractor ? (
              <div className="ui-actions-row">
                <span className="ui-muted">
                  Suggested: {suggestedSubcontractor.name} — {suggestedSubcontractor.distanceLabel}, score{" "}
                  {suggestedSubcontractor.scoreLabel}
                </span>
                {suggestedSubcontractor.isAtRisk ? <StatusPill kind="waiting">Below target score</StatusPill> : null}
              </div>
            ) : null}

            <Field
              label="Monthly revenue"
              optional
              inputMode="decimal"
              placeholder="2500"
              value={form.monthlyRevenue}
              onChange={(event) => {
                const value = event.target.value;
                setForm((current) => ({
                  ...current,
                  monthlyRevenue: value,
                  monthlySubcontractorPay: subcontractorPayTouched
                    ? current.monthlySubcontractorPay
                    : computeSuggestedSubcontractorPay(value),
                }));
              }}
            />

            <Field
              label="Monthly subcontractor pay"
              optional
              hint="Filled in at 70% of the revenue until you type your own number."
              inputMode="decimal"
              placeholder="1800"
              value={form.monthlySubcontractorPay}
              onChange={(event) => {
                setSubcontractorPayTouched(true);
                updateField("monthlySubcontractorPay", event.target.value);
              }}
            />
          </div>
        </Card>

        <Card title="Customer Contact">
          <div style={sectionStyle}>
            <Field label="Contact name" optional value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} />
            <Field label="Phone" optional inputMode="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
            <Field label="Email" optional inputMode="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
          </div>
        </Card>

        <Card title="Service Details">
          <div style={sectionStyle}>
            <Field label="Service type" optional value={form.serviceType} onChange={(event) => updateField("serviceType", event.target.value)} />
            <Field label="Frequency" optional value={form.frequency} onChange={(event) => updateField("frequency", event.target.value)} />
            <Field label="Cleaning days" optional value={form.cleaningDays} onChange={(event) => updateField("cleaningDays", event.target.value)} />
          </div>
        </Card>

        <Card title="Access, Scope & Notes">
          <div style={sectionStyle}>
            <SelectField label="Has key?" optional value={form.hasKey} onChange={(event) => updateField("hasKey", event.target.value)}>
              <option value="">Select</option>
              <option>Yes</option>
              <option>No</option>
              <option>N/A</option>
            </SelectField>

            <SelectField label="Checklist needed?" value={form.checklistNeeded} onChange={(event) => updateField("checklistNeeded", event.target.value)}>
              <option>No</option>
              <option>Yes</option>
            </SelectField>

            <Field label="Alarm code" optional value={form.alarmCode} onChange={(event) => updateField("alarmCode", event.target.value)} />

            <TextAreaField
              label="Key / Alarm / Access Info"
              optional
              rows={3}
              value={form.keyAlarmAccessInfo}
              onChange={(event) => updateField("keyAlarmAccessInfo", event.target.value)}
            />

            <TextAreaField label="Scope of work" optional rows={4} value={form.scopeOfWork} onChange={(event) => updateField("scopeOfWork", event.target.value)} />

            <TextAreaField label="Notes" optional rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </div>
        </Card>
      </form>
    </Screen>
  );
}
