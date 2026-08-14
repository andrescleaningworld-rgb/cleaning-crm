"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  const [message, setMessage] = useState("");
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
      setMessage("");
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

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Portal Access
                </span>
                <select
                  value={portalAccess}
                  onChange={(event) =>
                    setPortalAccess(event.target.value as "Yes" | "No")
                  }
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                >
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-black text-slate-700">
                  Full Address
                </span>
                <GoogleAddressAutocompleteInput
                  value={form.address}
                  onChange={(value) => updateField("address", value)}
                  onPlaceSelected={handlePlaceSelected}
                  placeholder="Example: 1010 Kendal Way, Tarrytown, NY 10591, USA"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  Start typing and pick a suggestion, or paste the full address
                  from Google Maps. City, state, and zip do not need to be
                  entered separately.
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
                <select
                  value={form.manager}
                  onChange={(event) =>
                    updateField("manager", event.target.value)
                  }
                  disabled={loadingManagers}
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:text-sm"
                >
                  <option value="">
                    {loadingManagers ? "Loading managers..." : "Select manager"}
                  </option>

                  {managerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Subcontractor
                </span>
                <select
                  value={form.subcontractor}
                  onChange={(event) =>
                    updateField("subcontractor", event.target.value)
                  }
                  disabled={loadingSubcontractors}
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:text-sm"
                >
                  <option value="">
                    {loadingSubcontractors
                      ? "Loading subcontractors..."
                      : "Select subcontractor"}
                  </option>

                  {subcontractorOptions.map((subcontractor) => (
                    <option
                      key={subcontractor.value}
                      value={subcontractor.value}
                    >
                      {subcontractor.label}
                    </option>
                  ))}
                </select>

                {!loadingSubcontractors && subcontractorOptions.length === 0 ? (
                  <p className="mt-2 text-xs font-semibold leading-5 text-red-500">
                    No subcontractors were found. Add the subcontractor first
                    from the Subcontractors page.
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    Subcontractor must come from the existing subcontractor
                    list.
                  </p>
                )}

                {suggestedSubcontractor ? (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold leading-5 text-slate-500">
                    <span>
                      Suggested: {suggestedSubcontractor.name} —{" "}
                      {suggestedSubcontractor.distanceLabel}, score{" "}
                      {suggestedSubcontractor.scoreLabel}
                    </span>
                    {suggestedSubcontractor.isAtRisk ? (
                      <span
                        title="Below target score."
                        className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800"
                      >
                        ⚠ Below target
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">
                  Monthly Revenue
                </span>
                <input
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
                  onChange={(event) => {
                    setSubcontractorPayTouched(true);
                    updateField("monthlySubcontractorPay", event.target.value);
                  }}
                  placeholder="Example: 1800"
                  className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500 sm:text-sm"
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-5">
            <h2 className="text-lg font-black text-slate-950">
              Customer Contact
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
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 p-5">
            <h2 className="text-lg font-black text-slate-950">
              Service Details
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
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