"use client";

// "Add account": the one form for adding an account. A switch at the top:
//
//   New customer: accepted an estimate (ON, the default)
//     The old "New Accepted Account" form. Status "New - setting up", the
//     account manager is required, the estimate (a file, or the Markate
//     estimate's link) is saved, no subcontractor (the 8 steps offer the
//     account to a sub). Scope, key / access and the Cleaning schedule
//     picker are optional, so the details are captured once; the picker
//     fills the account's Frequency / days / time, and the sub's schedule is
//     made from them when the sub says Yes. Save: POST /api/account-flow
//     "create" (the account, its 8 steps, the pin on the Board), then the
//     account page opens on step 1.
//   OFF: an existing account
//     Every field as before, the status picked by hand, no 8 steps. Save:
//     POST /api/accounts "addAccount", then the Welcome Packet offer.
//
// ?markate=<id> (Accounts Center -> From Markate) fills the form from the
// Markate estimate; ?new=1 starts with the switch on whatever a draft says;
// ?from=board sends Back to the Board. /accounts/new-accepted redirects here.

import { BigButton, Card, ErrorBox, Field, Screen, SelectField, showToast, TextAreaField, Tips } from "@/app/ui";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WelcomePacketSheet from "@/app/components/welcome-packet-sheet";
import GoogleAddressAutocompleteInput, {
  type PlaceAddressDetails,
} from "@/app/components/GoogleAddressAutocompleteInput";
import SubSuggestions from "@/app/components/sub-suggestions";
import { useInsuranceMap } from "@/app/components/sub-insurance";
import { findInsurance, niceDay } from "@/lib/subInsurance";
import PlusMinus from "@/app/components/plus-minus";
import SubPayFields from "@/app/components/sub-pay-fields";
import NewAccountContacts, { contactsProblem, saveExtraContacts, type NewContact } from "@/app/components/new-account-contacts";
import { afterFrequencyChange } from "@/lib/frequency";
import { DEFAULT_START_TIME, formatClock, START_TIME_MAX, START_TIME_MIN, START_TIME_STEP } from "@/lib/schedule-time";
import { ManagerOptions, useManagerNames } from "../../components/manager-options";
import { DEFAULT_MINUTES_ON_SITE, formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE, MINUTES_ON_SITE_STEP } from "@/lib/time-on-site";
import { AccountScheduleSection, saveSchedule } from "@/app/components/account-schedule";
import { emptyPlan, planIsEmpty, planProblems, type SchedulePlan } from "@/lib/schedule-plan";
import { DraftNotice, useFormDraft } from "@/app/components/form-draft";
import { accountFieldsFromPlan } from "@/lib/plan-account-fields";
import { FLOW_STATUS } from "@/lib/accountFlow";

/** What a Markate estimate fills in (GET /api/markate?estimate=<id>). */
type MarkatePrefill = {
  id: string;
  waiting: boolean;
  accountName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
  contactName: string;
  phone: string;
  email: string;
  price: string;
  estimateUrl: string;
  estimateName: string;
};

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
  /** The sub's price per cleaning (migration 048). "" = not set. */
  subPricePerCleaning: string;
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
  /** The database ID (lib/pg/subs.ts): what a suggestion's subId is. `id` is the old row number. */
  subId?: string;
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
  subPricePerCleaning: "",
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

// Drafts of the two old forms (app/components/form-draft.tsx keeps
// { savedAt, patch } under "cw-draft:<key>") move to this form's key once:
//   "new-account"            (Add Account)          -> the switch OFF
//   "new-accepted:<markate>" (New Accepted Account) -> the switch ON
// When both exist for the same key, the newer one is kept.
const DRAFT_PREFIX = "cw-draft:";
type StoredDraft = { savedAt: number; patch: Record<string, unknown> };

function readStoredDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft;
    return typeof stored?.savedAt === "number" && stored.patch && typeof stored.patch === "object" ? stored : null;
  } catch {
    return null;
  }
}

/** The old New Accepted draft in this form's shape (only what was typed). */
function fromNewAcceptedDraft(patch: Record<string, unknown>): Record<string, unknown> {
  const form: Record<string, unknown> = {};
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const put = (key: string, value: unknown) => {
    if (value !== undefined) form[key] = value;
  };
  put("accountName", text(patch.accountName));
  const place = (patch.place ?? {}) as Record<string, unknown>;
  for (const key of ["address", "city", "state", "zip", "latitude", "longitude"]) put(key, text(place[key]));
  put("monthlyRevenue", text(patch.price));
  put("contactName", text(patch.contactName));
  put("email", text(patch.email));
  put("phone", text(patch.phone));
  put("manager", text(patch.manager));
  const pay = (patch.subPay ?? {}) as Record<string, unknown>;
  put("monthlySubcontractorPay", text(pay.pay));
  put("subPricePerCleaning", text(pay.per));
  // Its own Frequency is gone: the Cleaning schedule picker sets it now.
  const out: Record<string, unknown> = { newCustomer: true, form };
  if (Array.isArray(patch.extraContacts)) out.extraContacts = patch.extraContacts;
  return out;
}

function carryOldDrafts(markateId: string): void {
  try {
    const target = `add-account:${markateId}`;
    const candidates: StoredDraft[] = [];
    const accepted = readStoredDraft(`new-accepted:${markateId}`);
    if (accepted) candidates.push({ savedAt: accepted.savedAt, patch: fromNewAcceptedDraft(accepted.patch) });
    const added = markateId ? null : readStoredDraft("new-account");
    if (added) candidates.push({ savedAt: added.savedAt, patch: { ...added.patch, newCustomer: false } });
    if (candidates.length === 0) return;
    if (!readStoredDraft(target)) {
      const newest = candidates.sort((a, b) => b.savedAt - a.savedAt)[0];
      window.localStorage.setItem(DRAFT_PREFIX + target, JSON.stringify(newest));
    }
    window.localStorage.removeItem(`${DRAFT_PREFIX}new-accepted:${markateId}`);
    if (!markateId) window.localStorage.removeItem(`${DRAFT_PREFIX}new-account`);
  } catch {
    // No storage here: nothing to carry.
  }
}

const EMAIL_SHAPE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

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
  // Read once from the address (see the top of this file).
  const [query] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search));
  const markateId = query.get("markate") ?? "";
  const forceNew = Boolean(markateId) || query.get("new") === "1";
  const backHref = query.get("from") === "board" ? "/board" : "/accounts";
  // The switch: a new customer who accepted an estimate (ON) or an existing account (OFF).
  const [newCustomer, setNewCustomer] = useState(true);
  // Filled from a Markate estimate: its id and the estimate link saved when no file is chosen.
  const [markate, setMarkate] = useState<MarkatePrefill | null>(null);
  const [estimateFile, setEstimateFile] = useState<File | null>(null);
  // The old forms' drafts move here before this form's draft is read (once).
  useState(() => {
    if (typeof window !== "undefined") carryOldDrafts(markateId);
    return true;
  });

  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [portalAccess, setPortalAccess] = useState<"Yes" | "No">("Yes");
  // Contacts after the first (main) one; saved once the account is made.
  const [extraContacts, setExtraContacts] = useState<NewContact[]>([]);
  // The Manager dropdown: the active managers on the Staff list.
  const { names: managerOptions, loading: loadingManagers } = useManagerNames();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingSubcontractors, setLoadingSubcontractors] = useState(true);
  const [error, setError] = useState("");
  // Set once the account is saved: the screen then offers "Send Customer Welcome Packet".
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const [showWelcomePacket, setShowWelcomePacket] = useState(false);
  // The optional schedule (Sub Schedules). Empty = the account saves without one.
  const [schedulePlan, setSchedulePlan] = useState<SchedulePlan>(emptyPlan);
  const [scheduleTried, setScheduleTried] = useState(false);
  const [suggestionStart, setSuggestionStart] = useState(DEFAULT_START_TIME);
  const [suggestionMinutes, setSuggestionMinutes] = useState(DEFAULT_MINUTES_ON_SITE);
  // Frequency, Cleaning days and Cleaning time, from the picker (null while it is empty).
  const planFields = useMemo(() => accountFieldsFromPlan(schedulePlan), [schedulePlan]);
  // A new frequency from the picker: the monthly pay stays and the price per cleaning is worked out again.
  function changeSchedulePlan(next: SchedulePlan) {
    const before = accountFieldsFromPlan(schedulePlan)?.frequency ?? form.frequency;
    const after = accountFieldsFromPlan(next)?.frequency ?? form.frequency;
    setSchedulePlan(next);
    if (after !== before) {
      setForm((current) => {
        const pay = afterFrequencyChange(after, current.monthlySubcontractorPay, current.subPricePerCleaning);
        return { ...current, monthlySubcontractorPay: pay.pay, subPricePerCleaning: pay.per };
      });
    }
  }
  // Unsaved typing is kept on this computer until Save (app/components/form-draft.tsx).
  const draft = useFormDraft(
    `add-account:${markateId}`,
    { newCustomer, form, portalAccess, extraContacts, schedulePlan, suggestionStart, suggestionMinutes },
    {
      // From a Markate estimate: once the estimate has filled the form in.
      ready: !markateId || markate !== null || error !== "",
      onRestore: (kept) => {
        setNewCustomer(forceNew ? true : kept.newCustomer !== false);
        setForm(kept.form);
        setPortalAccess(kept.portalAccess);
        setExtraContacts(kept.extraContacts);
        setSchedulePlan(kept.schedulePlan);
        setSuggestionStart(kept.suggestionStart);
        setSuggestionMinutes(kept.suggestionMinutes);
      },
    }
  );

  useEffect(() => {
    if (!markateId) return;
    fetch(`/api/markate?estimate=${encodeURIComponent(markateId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; prefill?: MarkatePrefill; error?: string }) => {
        const filled = data.prefill;
        if (!data.success || !filled) {
          setError(data.error || "The Markate estimate did not load. Type the details in.");
          return;
        }
        if (!filled.waiting) setError("This Markate estimate was already started or skipped. Saving makes another account.");
        setMarkate(filled);
        setForm((current) => ({
          ...current,
          accountName: filled.accountName,
          address: filled.address,
          city: filled.city,
          state: filled.state,
          zip: filled.zip,
          latitude: filled.latitude,
          longitude: filled.longitude,
          monthlyRevenue: filled.price,
          contactName: filled.contactName,
          phone: filled.phone,
          email: filled.email,
        }));
      })
      .catch(() => setError("The Markate estimate did not load. Type the details in."));
  }, [markateId]);

  useEffect(() => {
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

    loadSubcontractors();
  }, []);

  // Subs whose insurance expired say so in the list (app/components/sub-insurance.tsx).
  const insuranceMap = useInsuranceMap();
  const subcontractorOptions = useMemo<SubcontractorOption[]>(() => {
    return subcontractors
      .map((subcontractor) => ({
        value: getSubcontractorDropdownValue(subcontractor),
        label: `${getSubcontractorDisplayName(subcontractor)}${findInsurance(insuranceMap, subcontractor as Record<string, unknown>)?.state === "expired" ? " ⚠ insurance expired" : ""}`,
      }))
      .filter((option) => option.value && option.label)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subcontractors, insuranceMap]);
  const pickedInsurance = (() => {
    const picked = subcontractors.find((subcontractor) => getSubcontractorDropdownValue(subcontractor) === form.subcontractor);
    return picked ? findInsurance(insuranceMap, picked as Record<string, unknown>) : null;
  })();

  // Suggested subs (app/components/sub-suggestions.tsx) are informational
  // only here — they never write to form.subcontractor. They show once the
  // Full Address autocomplete has a map position (handlePlaceSelected below).
  const suggestionLat = form.latitude && Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null;
  const suggestionLng = form.longitude && Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null;

  // The score already merged onto `subcontractors` by /api/subcontractors, by sub ID.
  const scoreBySubId = useMemo(() => {
    const scores = new Map<string, number>();
    for (const subcontractor of subcontractors) {
      const id = cleanText(subcontractor.subId);
      const score = Number(subcontractor.score);
      if (id && subcontractor.score && Number.isFinite(score)) scores.set(id, score);
    }
    return scores;
  }, [subcontractors]);

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

  /** Switch ON: the account, its 8 steps and the pin on the Board (POST /api/account-flow "create"). */
  async function saveNewCustomer() {
    try {
      setSaving(true);
      setError("");
      const name = form.accountName.trim();
      if (!name) throw new Error("Type the customer name.");
      if (!form.manager.trim()) throw new Error("Pick the account manager.");
      if (form.email.trim() && !EMAIL_SHAPE.test(form.email.trim())) throw new Error("That email does not look right.");
      const contactsError = contactsProblem(extraContacts);
      if (contactsError) throw new Error(contactsError);
      const scheduleProblems = planIsEmpty(schedulePlan) ? [] : planProblems(schedulePlan);
      if (scheduleProblems.length > 0) {
        setScheduleTried(true);
        throw new Error(`Cleaning schedule: ${scheduleProblems[0]} Or tap Clear schedule to save without one.`);
      }

      // The estimate goes up first (same place as before).
      let estimateUrl = "";
      let estimateName = "";
      if (estimateFile) {
        const upload = new FormData();
        upload.append("file", estimateFile);
        const uploaded = await fetch("/api/handoffs/estimate", { method: "POST", body: upload });
        const data = (await uploaded.json().catch(() => ({}))) as { success?: boolean; error?: string; url?: string; name?: string };
        if (!uploaded.ok || !data.success || !data.url) throw new Error(data.error || "The estimate did not upload. Try again.");
        estimateUrl = data.url;
        estimateName = data.name ?? estimateFile.name;
      } else if (markate?.estimateUrl) {
        // No file chosen: the Markate estimate's own link is the estimate.
        estimateUrl = markate.estimateUrl;
        estimateName = markate.estimateName;
      }

      const response = await fetch("/api/account-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          accountName: name,
          address: form.address.trim(),
          city: form.city,
          state: form.state,
          zip: form.zip,
          latitude: form.latitude,
          longitude: form.longitude,
          monthlyRevenue: form.monthlyRevenue,
          contactName: form.contactName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          manager: form.manager.trim(),
          estimateUrl,
          estimateName,
          // Frequency, Cleaning days and Cleaning time from the picker (the sub's schedule is made from them on Yes).
          frequency: planFields?.frequency ?? "",
          cleaningDays: planFields?.cleaningDays ?? "",
          cleaningTime: planFields?.cleaningTime ?? "",
          monthlySubcontractorPay: form.monthlySubcontractorPay,
          subPricePerCleaning: form.subPricePerCleaning,
          scopeOfWork: form.scopeOfWork,
          hasKey: form.hasKey,
          alarmCode: form.alarmCode,
          keyAlarmAccessInfo: form.keyAlarmAccessInfo,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; accountId?: string };
      if (!response.ok || !data.success || !data.accountId) throw new Error(data.error || "The account was not saved. Try again.");
      // The contacts after the main one. The account is saved either way.
      const contactsFailed = await saveExtraContacts(data.accountId, extraContacts);
      draft.clear();
      // Made from a Markate estimate: it leaves the From Markate list (and the Board's New accepted square).
      if (markate?.waiting) {
        await fetch("/api/markate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "started", id: markate.id, accountId: data.accountId }) }).catch(() => undefined);
      }
      showToast(
        contactsFailed ? `Saved and pinned. ${contactsFailed} contact${contactsFailed === 1 ? "" : "s"} did not save: add ${contactsFailed === 1 ? "it" : "them"} on Edit Account.` : "Saved and pinned ✓",
        contactsFailed ? "bad" : "good"
      );
      router.push(`/accounts/${encodeURIComponent(data.accountId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The account was not saved. Try again.");
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newCustomer) return saveNewCustomer();

    try {
      setSaving(true);
      setError("");

      if (!form.accountName.trim()) {
        throw new Error("Account name is required.");
      }
      const contactsError = contactsProblem(extraContacts);
      if (contactsError) throw new Error(contactsError);

      // A schedule that was started must be finished first; an empty one is fine.
      const hasSchedule = !planIsEmpty(schedulePlan);
      const scheduleProblems = hasSchedule ? planProblems(schedulePlan) : [];
      if (scheduleProblems.length > 0) {
        setScheduleTried(true);
        throw new Error(`Cleaning schedule: ${scheduleProblems[0]} Or tap Clear schedule to save without one.`);
      }

      const accountPayload: AccountForm = {
        ...form,
        // Frequency, Cleaning days and Cleaning time follow the Cleaning schedule picker (lib/plan-account-fields.ts).
        ...(planFields ? { frequency: planFields.frequency, cleaningDays: planFields.cleaningDays, cleaningTime: planFields.cleaningTime } : {}),
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

      // The contacts after the main one. The account is saved either way; a contact that did not save can be added on Edit Account.
      const contactsFailed = data.accountId ? await saveExtraContacts(data.accountId, extraContacts) : 0;

      // The schedule, under the sub picked above (by email, as Sub Schedules keeps it). The account is saved either way.
      let scheduleFailed = false;
      if (hasSchedule && data.accountId) {
        const pickedSub = subcontractors.find((subcontractor) => getSubcontractorDropdownValue(subcontractor) === form.subcontractor);
        const result = await saveSchedule({
          accountId: data.accountId,
          accountName: accountPayload.accountName,
          subId: cleanText(pickedSub?.email),
          plan: schedulePlan,
          closeScheduleIds: [],
        });
        scheduleFailed = !result.ok;
      }

      draft.clear();
      // A "Checklist Needed" warning is not a failure: the account is saved.
      showToast(
        contactsFailed
          ? `Account saved, but ${contactsFailed} contact${contactsFailed === 1 ? "" : "s"} did not save. Add ${contactsFailed === 1 ? "it" : "them"} on Edit Account.`
          : scheduleFailed
            ? "Account saved, but the schedule did not save. Add it on the account page."
            : data.checklistFlagWarning || "Account saved",
        contactsFailed || scheduleFailed || data.checklistFlagWarning ? "bad" : "good"
      );

      // With the new account's ID the screen stays, to offer the Welcome Packet;
      // without one (the old Sheets path) it goes back to the list as before.
      if (data.accountId) {
        setSaved({ id: data.accountId, name: accountPayload.accountName });
      } else {
        setTimeout(() => {
          router.push("/accounts");
        }, 800);
      }
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

  if (saved) {
    return (
      <Screen title="Account saved" subtitle={saved.name} backHref="/accounts">
        <Card title={`✓ ${saved.name} is saved`}>
          <div style={sectionStyle}>
            <p className="ui-card-text">Send the customer their Welcome Packet now: the team, the two visits before the first cleaning, and the policies.</p>
            <BigButton onClick={() => setShowWelcomePacket(true)}>Send Customer Welcome Packet</BigButton>
            <BigButton kind="second" href={`/accounts/${encodeURIComponent(saved.id)}`}>
              Open the account
            </BigButton>
            <BigButton kind="quiet" href="/accounts">
              Back to accounts
            </BigButton>
          </div>
        </Card>
        <WelcomePacketSheet open={showWelcomePacket} accountId={saved.id} accountName={saved.name} onClose={() => setShowWelcomePacket(false)} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Add account"
      subtitle={newCustomer ? "A new customer who accepted an estimate." : "An account we already clean."}
      backHref={backHref}
      action={
        <BigButton type="submit" form="new-account-form" busy={saving} busyLabel="Saving…">
          Save account
        </BigButton>
      }
      secondaryAction={
        <BigButton kind="quiet" href={backHref} disabled={saving}>
          Cancel
        </BigButton>
      }
    >
      <Tips
        id="add-account-switch"
        ready
        steps={[
          {
            target: '[data-tip="new-customer-switch"]',
            text: "One form for every new account. On: a new customer who accepted an estimate (the 8 new-account steps). Off: an account we already clean.",
          },
        ]}
      />
      {error ? <ErrorBox title="The account was not saved." text={error} /> : null}
      <DraftNotice draft={draft} />

      <form id="new-account-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* The switch: which kind of account this is. */}
        <Card>
          <div style={sectionStyle} data-tip="new-customer-switch">
            <label className="ui-toggle">
              <input type="checkbox" role="switch" checked={newCustomer} disabled={saving} onChange={(event) => setNewCustomer(event.target.checked)} />
              <span>New customer: accepted an estimate</span>
            </label>
            <p className="ui-hint" style={{ margin: 0 }}>
              {newCustomer
                ? "On: the account starts the 8 new-account steps (welcome packet, sub, walkthrough…) and is pinned on the Board. Turn it off to add an account we already clean."
                : "Off: an account we already clean. No new-account steps; you pick the status."}
            </p>
          </div>
        </Card>

        <Card title="Account Information">
          <div style={sectionStyle}>
            <Field
              label={newCustomer ? "Customer name" : "Account name"}
              value={form.accountName}
              onChange={(event) => updateField("accountName", event.target.value)}
              required
            />

            {newCustomer ? (
              <p className="ui-card-text" style={{ margin: 0 }}>
                <strong>Status:</strong> {FLOW_STATUS}. It becomes Active at the end of the 8 steps.
              </p>
            ) : (
              <>
                <SelectField label="Status" value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                  <option>Active</option>
                  <option>Paused</option>
                  <option>Suspended</option>
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
              </>
            )}

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
              label={newCustomer ? "Account manager" : "Manager"}
              optional={!newCustomer}
              hint={newCustomer ? "The pin goes in this manager's square on the Board." : undefined}
              value={form.manager}
              onChange={(event) => updateField("manager", event.target.value)}
              disabled={loadingManagers}
            >
              <option value="">{loadingManagers ? "Loading managers…" : newCustomer ? "Pick the manager" : "Select manager"}</option>
              <ManagerOptions names={managerOptions} current={form.manager} />
            </SelectField>
            {newCustomer ? null : (
              <>
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
                {pickedInsurance?.state === "expired" ? (
                  <p className="ui-field-error">⚠ This sub&apos;s insurance expired on {niceDay(pickedInsurance.expiresOn)}.</p>
                ) : null}
                <SubSuggestions
                  lat={suggestionLat}
                  lng={suggestionLng}
                  cleaningDays={planFields?.cleaningDays ?? form.cleaningDays}
                  start={suggestionStart}
                  minutes={suggestionMinutes}
                  scoreBySubId={scoreBySubId}
                  hint="Tap one to pick it."
                  selectedId={cleanText(subcontractors.find((subcontractor) => getSubcontractorDropdownValue(subcontractor) === form.subcontractor)?.subId)}
                  onSelect={(result) => {
                    const picked = subcontractors.find((subcontractor) => cleanText(subcontractor.subId) === result.subId);
                    if (picked) updateField("subcontractor", getSubcontractorDropdownValue(picked));
                  }}
                />
                {form.latitude && form.longitude ? (
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <div>
                      <p className="ui-label">Time</p>
                      <PlusMinus value={suggestionStart} onChange={setSuggestionStart} step={START_TIME_STEP} min={START_TIME_MIN} max={START_TIME_MAX} label="Start time to check" format={formatClock} />
                    </div>
                    <div>
                      <p className="ui-label">Length</p>
                      <PlusMinus value={suggestionMinutes} onChange={setSuggestionMinutes} step={MINUTES_ON_SITE_STEP} min={MIN_MINUTES_ON_SITE} max={MAX_MINUTES_ON_SITE} label="Length to check" format={formatMinutes} />
                    </div>
                  </div>
                ) : null}
              </>
            )}
            {newCustomer ? <p className="ui-hint" style={{ margin: 0 }}>The subcontractor is picked in step 2 of the new-account steps: the account is offered to them.</p> : null}
            <Field
              label={newCustomer ? "Monthly price" : "Monthly revenue"}
              optional
              inputMode="decimal"
              placeholder="2500"
              value={form.monthlyRevenue}
              onChange={(event) => updateField("monthlyRevenue", event.target.value)}
            />
            {/* The reminder, the 70% suggestion, Frequency when missing, and the two pay boxes in step. */}
            <SubPayFields
              revenue={form.monthlyRevenue}
              frequency={planFields?.frequency ?? form.frequency}
              onFrequency={() => undefined}
              frequencyAbove
              missingFrequencyText="Set the Cleaning schedule first: the price per cleaning needs it."
              pay={form.monthlySubcontractorPay}
              per={form.subPricePerCleaning}
              onPay={({ pay, per }) => setForm((current) => ({ ...current, monthlySubcontractorPay: pay, subPricePerCleaning: per }))}
              disabled={saving}
            />
          </div>
        </Card>

        <Card title="Customer Contacts">
          <div style={sectionStyle}>
            <NewAccountContacts
              main={{ name: form.contactName, phone: form.phone, email: form.email }}
              onMain={(field, value) => updateField(field === "name" ? "contactName" : field, value)}
              extras={extraContacts}
              onExtras={setExtraContacts}
              disabled={saving}
            />
          </div>
        </Card>

        {newCustomer ? (
          <Card title="Accepted estimate">
            <div style={sectionStyle}>
              <div className="ui-field">
                <label className="ui-label" htmlFor="estimate-file">
                  Estimate PDF <span className="ui-optional">(optional)</span>
                </label>
                <input id="estimate-file" type="file" accept="application/pdf,image/*" className="ui-input" disabled={saving} onChange={(event) => setEstimateFile(event.target.files?.[0] ?? null)} />
                <p className="ui-hint">
                  {estimateFile
                    ? `Chosen: ${estimateFile.name}`
                    : markate?.estimateUrl
                      ? "The Markate estimate link is saved. Choose a file only to use it instead."
                      : "Or a photo of it. 10MB or smaller. It is filed in the account's Documents."}
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card title="Service Details">
            <div style={sectionStyle}>
              <Field label="Service type" optional value={form.serviceType} onChange={(event) => updateField("serviceType", event.target.value)} />
            </div>
          </Card>
        )}

        <AccountScheduleSection
          plan={schedulePlan}
          onChange={changeSchedulePlan}
          showProblems={scheduleTried}
          disabled={saving}
          note={
            newCustomer ? (
              <p className="ui-hint" style={{ margin: 0 }}>
                The days and time are kept on the account. The sub&apos;s schedule is made from them when the sub says Yes.
              </p>
            ) : undefined
          }
        />

        <Card title={newCustomer ? "Access & Scope (optional)" : "Access, Scope & Notes"}>
          <div style={sectionStyle}>
            <SelectField label="Has key?" optional value={form.hasKey} onChange={(event) => updateField("hasKey", event.target.value)}>
              <option value="">Select</option>
              <option>Yes</option>
              <option>No</option>
              <option>N/A</option>
            </SelectField>
            {newCustomer ? null : (
              <SelectField label="Checklist needed?" value={form.checklistNeeded} onChange={(event) => updateField("checklistNeeded", event.target.value)}>
                <option>No</option>
                <option>Yes</option>
              </SelectField>
            )}
            <Field label="Alarm code" optional value={form.alarmCode} onChange={(event) => updateField("alarmCode", event.target.value)} />
            <TextAreaField
              label="Key / Alarm / Access Info"
              optional
              rows={3}
              value={form.keyAlarmAccessInfo}
              onChange={(event) => updateField("keyAlarmAccessInfo", event.target.value)}
            />

            <TextAreaField label="Scope of work" optional rows={4} value={form.scopeOfWork} onChange={(event) => updateField("scopeOfWork", event.target.value)} />

            {newCustomer ? null : (
              <TextAreaField label="Notes" optional rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
            )}
          </div>
        </Card>
      </form>
    </Screen>
  );
}
