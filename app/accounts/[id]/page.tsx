"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BigButton,
  Card,
  ErrorBox,
  Screen,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  TextAreaField,
  CHEER,
  Tile,
  Tips,
  showToast,
  undoable,
  type StatusKind,
} from "@/app/ui";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getGoogleMapsUrl } from "../../lib/backend";
import { AccountPacketPrintView } from "./account-packet-print-view";
import OnboardingChecklist, { SetupReadyBadge } from "../../components/OnboardingChecklist";
import OnboardingWizardModal from "../../components/OnboardingWizardModal";
import ChecklistTemplateEditor from "../../components/ChecklistTemplateEditor";
import AccountHistory from "../../components/AccountHistory";
import QuickToDoSheet from "../../components/QuickToDoSheet";
import NextCleaning from "./next-cleaning";
import TimeOnSiteDetail from "./time-on-site";
import { NoScheduleBanner } from "../../components/no-schedule";
import CancellationFields from "../../components/CancellationFields";
import { cancellationNote, cancellationProblem, isCancelledStatus } from "@/lib/cancellation";
import SitePhotos from "./site-photos";
import PhotosLink from "./photos-link";
import AccountEverything from "./account-everything";
import AccountSignals from "./account-signals";
import AccountContacts from "../../components/AccountContacts";
import SupplyMode from "./supply-mode";
import SiteStock from "./site-stock";
import { PinButton, usePinInfo } from "../../components/pin-to-board";
import PrintOrPinSheet from "./print-or-pin";
import WelcomePacketSheet, { welcomeSentLabel } from "../../components/welcome-packet-sheet";
import SubPacketSheet from "../../components/sub-packet-sheet";
import PortalInviteSheet, { invitedLine, type PortalInviteRecord } from "./portal-invite-sheet";
import PreviewLinks from "./preview-links";
import TaxExemptButton from "./tax-exempt";
import AccountFlowPanel from "../../components/account-flow";
import DeleteAccountSheet from "../../components/delete-account-sheet";
import { payShare } from "@/lib/payShare";
import { cleaningsPerMonth, cleaningsPerMonthText, perCleaningFromMonthlyPay } from "@/lib/frequency";
import { describeCleaningTime } from "@/lib/cleaningTime";

type Account = {
  id?: string;
  accountId?: string;
  rowNumber?: number;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  manager?: string;
  subcontractor?: string;
  subcontractorEmail?: string;
  finalCleaningDate?: string;
  cancellationReason?: string;
  status?: string;
  accountHealth?: string;
  monthlyRevenue?: string;
  subcontractorPay?: string;
  monthlySubcontractorPay?: string;
  grossMargin?: string;
  grossMarginPercent?: string;
  hasKey?: string;
  alarmCode?: string;
  alarmInfo?: string;
  accountStartDate?: string;
  startDate?: string;
  serviceStartDate?: string;
  cleaningSchedule?: string;
  schedule?: string;
  frequency?: string;
  /** The sub's price per cleaning (migration 048). "" = not set. */
  subPricePerCleaning?: string;
  /** "18:00-21:00" (window) or "19:00" (exact), migration 050. */
  cleaningTime?: string;
  cleaningDays?: string;
  scope?: string;
  scopeOfWork?: string;
  notes?: string;

  contactPerson?: string;
  contactName?: string;
  primaryContact?: string;
  mainContact?: string;
  customerContact?: string;
  phone?: string;
  contactPhone?: string;
  customerPhone?: string;
  email?: string;
  contactEmail?: string;
  customerEmail?: string;
};

type Subcontractor = {
  id?: string;
  subcontractorId?: string;
  companyName?: string;
  contactName?: string;
  displayName?: string;
  dropdownLabel?: string;
  name?: string;
  subcontractor?: string;
  email?: string;
  phone?: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: Account[];
  accounts?: Account[];
};

type PortalAccountRecord = {
  accountName?: string;
  portalSheetRow?: number | null;
  portalAccess?: string;
};

type PortalAccountActionResponse = {
  success?: boolean;
  error?: string;
  portalAccess?: string;
  portalCode?: string;
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: Subcontractor[];
  subcontractors?: Subcontractor[];
  subs?: Subcontractor[];
};

// The four account statuses. (The New Account flow sets its own "New - setting up".)
type QuickStatusOption = "Active" | "Paused" | "Suspended" | "Cancelled";

const quickStatusOptions: QuickStatusOption[] = ["Active", "Paused", "Suspended", "Cancelled"];

function normalizeValue(value: string | number | undefined | null) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/%20/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeSubcontractorMatch(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();
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

function formatMoney(value: string | undefined) {
  const number = moneyToNumber(value);

  if (!number) return value || "N/A";

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatCalculatedMoney(value: number) {
  if (!value) return "N/A";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// Same rules, in the same order, as the old color classes.
function accountStatusKind(status: string | undefined): StatusKind {
  const clean = String(status || "").toLowerCase();

  // Red is only for problems: a cancelled account is finished, so it is gray.
  if (clean.includes("cancel") || clean.includes("inactive") || clean.includes("lost")) return "off";
  if (clean.includes("active")) return "done";
  if (clean.includes("pause")) return "waiting";

  return "off";
}

function accountHealthKind(health: string | undefined): StatusKind {
  const clean = String(health || "").toLowerCase();

  if (clean.includes("high risk")) return "needs-you";
  if (clean.includes("attention")) return "waiting";
  if (clean.includes("stable") || clean.includes("good") || clean.includes("excellent")) return "done";

  return "off";
}

function getAccountId(account: Account, fallback = "") {
  return cleanText(
    account.accountId ||
      account.id ||
      account.rowNumber ||
      account.accountName ||
      fallback
  );
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    throw new Error("The server did not return valid JSON.");
  }
}

async function readSubcontractorsApiResponse(
  response: Response
): Promise<SubcontractorsApiResponse> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as SubcontractorsApiResponse;
  } catch {
    throw new Error("The subcontractors server did not return valid JSON.");
  }
}

async function readPortalAccountsResponse(
  response: Response
): Promise<PortalAccountRecord[]> {
  const text = await response.text();

  if (!text.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as PortalAccountRecord[]) : [];
  } catch {
    throw new Error("The portal accounts server did not return valid JSON.");
  }
}

async function readPortalActionResponse(
  response: Response
): Promise<PortalAccountActionResponse> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as PortalAccountActionResponse;
  } catch {
    throw new Error("The portal accounts server did not return valid JSON.");
  }
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawAccountIdFromUrl = String(params?.id || "");
  const decodedAccountIdFromUrl = decodeURIComponent(rawAccountIdFromUrl);
  const normalizedUrlValue = normalizeValue(decodedAccountIdFromUrl);

  const [account, setAccount] = useState<Account | null>(null);
  // True once the Contacts card is showing: Account Snapshot then leaves the contact to it.
  const [contactsOn, setContactsOn] = useState(false);
  // The main contact changed in the Contacts card: the Call tile and the rest of this page follow.
  const followMainContact = useCallback((main: { name: string; phone: string; email: string }) => {
    setAccount((current) => (current ? { ...current, contactPerson: main.name, contactName: main.name, phone: main.phone, contactPhone: main.phone, email: main.email, contactEmail: main.email } : current));
  }, []);
  const contactsReady = useCallback(() => setContactsOn(true), []);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  // Team Hub tab hidden 2026-09-24 (Crew Link replaces it) — the page
  // always shows Details; ./team-hub-tab.tsx is kept, just not rendered.
  const activeTab = "details" as const;
  // "Send Sub Packet": the preview with Send / Cancel (app/components/sub-packet-sheet.tsx).
  const [showSubPacket, setShowSubPacket] = useState(false);
  // "Invite to portal": the preview and share sheet (./portal-invite-sheet.tsx), and the last invites ("Invited Oct 28 by Greg").
  const [showPortalInvite, setShowPortalInvite] = useState(false);
  const [portalInvites, setPortalInvites] = useState<PortalInviteRecord[]>([]);
  // The customer Welcome Packet sheet. The version goes up after a send, so the checklist and History read again.
  const [showWelcomePacket, setShowWelcomePacket] = useState(false);
  const [welcomeVersion, setWelcomeVersion] = useState(0);
  const [welcomeSentAt, setWelcomeSentAt] = useState<string | null>(null);
  // Goes up when the Onboarding Checklist closes, so the new-account steps read again.
  const [flowVersion, setFlowVersion] = useState(0);
  // The setup wizard saved something: the page reads the account again when it closes.
  const [accountVersion, setAccountVersion] = useState(0);
  const setupChanged = useRef(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [error, setError] = useState("");
  const [showPdfModal, setShowPdfModal] = useState(false);
  // Print PDF first asks: print, pin to the board, or both. Works whatever Settings -> Pin Board -> Accounts says.
  const [showPrintChoice, setShowPrintChoice] = useState(false);
  // Which variant is currently being fetched/printed, if any — also doubles
  // as the "an action is in flight" flag that disables both choice buttons.
  const [printingVariant, setPrintingVariant] = useState<"teamLeader" | "admin" | null>(null);
  const [pdfError, setPdfError] = useState("");
  const printIframeRef = useRef<HTMLIFrameElement>(null);
  const [showFullAccountInfo, setShowFullAccountInfo] = useState(false);
  // Redesign: everything that is not one of the six tiles sits behind "More".
  const [showMore, setShowMore] = useState(false);
  const [showToDo, setShowToDo] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  // Pin Board: the "Pin to board" button (only where accounts are switched on in Settings -> Pin Board).
  const { info: pinInfo, reload: reloadPinInfo } = usePinInfo();

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<QuickStatusOption>("Active");
  const [statusReason, setStatusReason] = useState("");
  // Asked only when the new status is Cancelled (see lib/cancellation.ts).
  const [finalCleaningDate, setFinalCleaningDate] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [portalSheetRow, setPortalSheetRow] = useState<number | null>(null);
  const [portalAccess, setPortalAccess] = useState<"YES" | "NO">("NO");
  const [togglingPortalAccess, setTogglingPortalAccess] = useState(false);
  const [portalAccessError, setPortalAccessError] = useState("");

  // Opens only via the "Start Onboarding"/"Continue Onboarding" button below
  // or a `?onboarding=1` deep link from a "New Account Onboarding" to-do —
  // never automatically on load otherwise (see the effect below).
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const hasAppliedOnboardingQueryTrigger = useRef(false);

  useEffect(() => {
    if (hasAppliedOnboardingQueryTrigger.current) return;
    if (!account) return;
    if (searchParams?.get("onboarding") !== "1") return;
    hasAppliedOnboardingQueryTrigger.current = true;
    setShowOnboardingWizard(true);
  }, [account, searchParams]);

  async function fetchPortalAccountMatch(
    accountName: string
  ): Promise<{ sheetRow: number | null; access: "YES" | "NO" }> {
    const response = await fetch("/api/admin/portal-accounts", {
      cache: "no-store",
    });

    const records = await readPortalAccountsResponse(response);
    const normalizedName = normalizeValue(accountName);

    const match = records.find(
      (record) => normalizeValue(record.accountName) === normalizedName
    );

    return {
      sheetRow: match?.portalSheetRow ?? null,
      access: match?.portalAccess?.toUpperCase() === "YES" ? "YES" : "NO",
    };
  }

  useEffect(() => {
    async function loadAccount() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const data = await readApiResponse(response);

        if (!response.ok || data.success === false) {
          throw new Error(data.error || "Could not load accounts.");
        }

        const accounts: Account[] = data.accounts || data.data || [];

        try {
          const subcontractorsResponse = await fetch("/api/subcontractors", {
            cache: "no-store",
          });

          const subcontractorsData = await readSubcontractorsApiResponse(
            subcontractorsResponse
          );

          if (
            subcontractorsResponse.ok &&
            subcontractorsData.success !== false
          ) {
            setSubcontractors(
              subcontractorsData.subcontractors ||
                subcontractorsData.subs ||
                subcontractorsData.data ||
                []
            );
          }
        } catch {
          setSubcontractors([]);
        }

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
          console.log("Account URL value:", decodedAccountIdFromUrl);
          console.log("Available accounts:", accounts);
          throw new Error("Could not find this account.");
        }

        setAccount(foundAccount);

        try {
          const { sheetRow, access } = await fetchPortalAccountMatch(
            foundAccount.accountName || ""
          );
          setPortalSheetRow(sheetRow);
          setPortalAccess(access);
        } catch {
          // Do not block the page if portal access info fails to load.
        }
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

    loadAccount();
  }, [decodedAccountIdFromUrl, normalizedUrlValue, accountVersion]);

  const accountAddress = useMemo(() => {
    if (!account) return "";

    if (account.address) return account.address;

    return [account.city, account.state, account.zip].filter(Boolean).join(", ");
  }, [account]);

  const monthlyRevenueNumber = moneyToNumber(account?.monthlyRevenue);
  const subcontractorPayNumber = moneyToNumber(
    account?.subcontractorPay || account?.monthlySubcontractorPay
  );
  const estimatedGrossMargin = monthlyRevenueNumber - subcontractorPayNumber;
  // The sub's share and what we keep, as % of monthly revenue (staff only).
  const share = payShare(monthlyRevenueNumber, subcontractorPayNumber);
  // The sub's price per cleaning: as saved, else worked out from the monthly pay and the Frequency.
  const cleaningsAMonth = cleaningsPerMonth(account?.frequency);
  const perCleaning = moneyToNumber(account?.subPricePerCleaning) || perCleaningFromMonthlyPay(subcontractorPayNumber, account?.frequency) || 0;
  const perCleaningText =
    perCleaning && cleaningsAMonth !== null
      ? `${perCleaning.toLocaleString("en-US", { style: "currency", currency: "USD" })} × ${cleaningsPerMonthText(cleaningsAMonth)} cleanings a month`
      : "Not worked out (Frequency is Other or blank)";

  const accountNameForUrl = encodeURIComponent(account?.accountName || "");
  const accountIdForUrl = encodeURIComponent(
    String(
      account?.accountId ||
        account?.id ||
        account?.rowNumber ||
        account?.accountName ||
        rawAccountIdFromUrl
    )
  );

  const accountComplaintLink = `/complaints/new?accountId=${accountIdForUrl}&accountName=${accountNameForUrl}&account=${accountNameForUrl}`;

  const startDate =
    account?.accountStartDate ||
    account?.startDate ||
    account?.serviceStartDate ||
    "Not provided";

  const cleaningDays =
    account?.cleaningDays ||
    account?.cleaningSchedule ||
    account?.schedule ||
    "Not provided";

  const cleaningFrequency = account?.frequency || "Not provided";

  const subcontractorPay =
    account?.subcontractorPay || account?.monthlySubcontractorPay || "";

  const alarmInfo = account?.alarmInfo || account?.alarmCode || "";

  const contactPerson =
    account?.contactPerson ||
    account?.contactName ||
    account?.primaryContact ||
    account?.mainContact ||
    account?.customerContact ||
    "N/A";

  const contactPhone =
    account?.phone ||
    account?.contactPhone ||
    account?.customerPhone ||
    "N/A";

  useEffect(() => {
    if (searchParams.get("onboarding") === "1") {
      setShowMore(true);
      setShowOnboardingWizard(true);
    }
  }, [searchParams]);

  // "Sent <date>" on the Welcome Packet button: the last send on the account's History.
  const welcomeAccountId = account ? getAccountId(account, rawAccountIdFromUrl) : "";
  useEffect(() => {
    if (!welcomeAccountId) return;
    let alive = true;
    fetch(`/api/accounts/${encodeURIComponent(welcomeAccountId)}/welcome-packet?summary=1`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; lastSentAt?: string | null }) => {
        if (alive && data.success) setWelcomeSentAt(data.lastSentAt ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [welcomeAccountId]);

  // "Invited <date> by <name>" on the Invite to portal button: the last invite in the account's History.
  useEffect(() => {
    if (!welcomeAccountId) return;
    let alive = true;
    fetch(`/api/admin/portal-invite?accountId=${encodeURIComponent(welcomeAccountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; invites?: PortalInviteRecord[] }) => {
        if (alive && data.success) setPortalInvites(data.invites ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [welcomeAccountId]);

  const hasContactPhone =contactPhone !== "N/A" && /[0-9]/.test(contactPhone);

  function makeTelLink(phone: string | undefined | null): string {
    if (!phone || phone === "N/A") return "#";
    const cleaned = phone.replace(/[^0-9+]/g, "");
    return `tel:${cleaned}`;
  }

  const contactEmail =
    account?.email ||
    account?.contactEmail ||
    account?.customerEmail ||
    "N/A";

  const matchedSubcontractor = useMemo(() => {
    if (!account?.subcontractor) return null;

    const accountSubcontractor = normalizeSubcontractorMatch(
      account.subcontractor
    );

    return (
      subcontractors.find((sub) => {
        const companyName = normalizeSubcontractorMatch(sub.companyName);
        const subcontractorName = normalizeSubcontractorMatch(sub.subcontractor);
        const displayName = normalizeSubcontractorMatch(sub.displayName);
        const dropdownLabel = normalizeSubcontractorMatch(sub.dropdownLabel);
        const contactName = normalizeSubcontractorMatch(sub.contactName);
        const name = normalizeSubcontractorMatch(sub.name);

        return (
          companyName === accountSubcontractor ||
          subcontractorName === accountSubcontractor ||
          displayName === accountSubcontractor ||
          dropdownLabel === accountSubcontractor ||
          contactName === accountSubcontractor ||
          name === accountSubcontractor
        );
      }) || null
    );
  }, [account?.subcontractor, subcontractors]);

  const subcontractorContactDisplay =
    matchedSubcontractor?.contactName ||
    matchedSubcontractor?.name ||
    account?.subcontractor ||
    "Unassigned";

  const subcontractorCompanyDisplay =
    matchedSubcontractor?.companyName &&
    matchedSubcontractor.companyName !== subcontractorContactDisplay
      ? matchedSubcontractor.companyName
      : "";

  function openPdfModal() {
    if (!account) return;
    setPdfError("");
    setShowPdfModal(true);
  }

  function closePdfModal() {
    if (printingVariant) return;
    setShowPdfModal(false);
    setPdfError("");
  }

  // Fetches the PDF as a blob, loads it into a hidden iframe, then calls the
  // iframe's own print() — this opens the browser's native print dialog
  // directly against the rendered PDF (same UX as Ctrl+P on a real page),
  // rather than a download the user has to go find and open manually. Falls
  // back to opening the PDF in a new tab if print() can't be invoked for any
  // reason, so there's always a way to reach it.
  async function handlePrintPacket(variant: "teamLeader" | "admin") {
    if (!account) return;

    try {
      setPrintingVariant(variant);
      setPdfError("");

      const url =
        variant === "admin"
          ? `/api/accounts/${accountIdForUrl}/pdf/admin`
          : `/api/accounts/${accountIdForUrl}/pdf`;

      const response = await fetch(url);

      if (!response.ok) {
        const data = await readApiResponse(response).catch(() => ({}) as ApiResponse);
        throw new Error(data.error || "Could not generate the account packet PDF.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const iframe = printIframeRef.current;
      if (!iframe) {
        throw new Error("Print preview is not ready. Please try again.");
      }

      await new Promise<void>((resolve) => {
        const handleLoad = () => {
          iframe.removeEventListener("load", handleLoad);
          resolve();
        };
        iframe.addEventListener("load", handleLoad);
        iframe.src = objectUrl;
        // Some browsers' embedded PDF viewers don't reliably fire `load`
        // once the PDF itself has actually rendered — this bounds the wait
        // so a missed event can't hang the button forever.
        setTimeout(resolve, 3000);
      });

      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error("Print preview window is unavailable.");
        win.focus();
        win.print();
      } catch {
        window.open(objectUrl, "_blank");
      }

      setShowPdfModal(false);
      // Delayed, not immediate — the iframe/new tab needs the blob URL to
      // stay valid long enough to finish loading and for the print dialog
      // (or the fallback tab) to actually open.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      setPdfError(
        err instanceof Error
          ? err.message
          : "Something went wrong generating the account packet PDF."
      );
    } finally {
      setPrintingVariant(null);
    }
  }

  async function handleTogglePortalAccess() {
    if (!account) return;

    const accountName = cleanText(account.accountName);
    if (!accountName) return;

    try {
      setTogglingPortalAccess(true);
      setPortalAccessError("");

      if (portalSheetRow == null) {
        const response = await fetch("/api/admin/portal-accounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountName,
            phone: contactPhone !== "N/A" ? contactPhone : "",
            accountId: getAccountId(account, rawAccountIdFromUrl),
          }),
        });

        const data = await readPortalActionResponse(response);

        if (!response.ok || data.success === false) {
          throw new Error(data.error || "Could not enable portal access.");
        }

        const { sheetRow, access } = await fetchPortalAccountMatch(
          accountName
        );
        setPortalSheetRow(sheetRow);
        setPortalAccess(access);
        return;
      }

      const response = await fetch("/api/admin/portal-accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sheetRow: portalSheetRow,
          action: "toggleAccess",
          currentAccess: portalAccess,
        }),
      });

      const data = await readPortalActionResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Could not update portal access.");
      }

      setPortalAccess(data.portalAccess === "YES" ? "YES" : "NO");
    } catch (err) {
      setPortalAccessError(
        err instanceof Error
          ? err.message
          : "Something went wrong updating portal access."
      );
    } finally {
      setTogglingPortalAccess(false);
    }
  }

  function openStatusModal() {
    if (!account) return;

    const currentStatus = cleanText(account.status);

    setNewStatus(
      quickStatusOptions.includes(currentStatus as QuickStatusOption)
        ? (currentStatus as QuickStatusOption)
        : "Active"
    );
    setStatusReason("");
    setFinalCleaningDate("");
    setCancellationReason("");
    setStatusError("");
    setStatusMessage("");
    setShowStatusModal(true);
  }

  function closeStatusModal() {
    if (savingStatus) return;

    setShowStatusModal(false);
    setStatusReason("");
    setFinalCleaningDate("");
    setCancellationReason("");
    setStatusError("");
  }

  // What still has to be filled in before the status can be saved; "" when nothing.
  // Cancelled asks for the final cleaning date and a reason, and for a note only when the reason is "Other".
  // For every other status the note is optional, as its label says.
  function statusProblem(): string {
    return newStatus === "Cancelled" ? cancellationProblem({ finalCleaningDate, reason: cancellationReason, notes: statusReason }) : "";
  }

  async function handleSaveStatusChange() {
    if (!account) return;

    const cleanReason = statusReason.trim();
    const cancelling = newStatus === "Cancelled";

    const problem = statusProblem();
    if (problem) {
      setStatusError(problem);
      return;
    }

    const oldStatus = cleanText(account.status) || "N/A";
    const accountId = getAccountId(account, rawAccountIdFromUrl);
    const accountName = cleanText(account.accountName) || "Unnamed Account";

    try {
      setSavingStatus(true);
      setStatusError("");
      setStatusMessage("");

      const accountResponse = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateAccountFields",
          accountId,
          fields: cancelling ? { status: newStatus, finalCleaningDate, cancellationReason } : { status: newStatus },
        }),
      });

      const accountData = await readApiResponse(accountResponse);

      if (!accountResponse.ok || accountData.success === false) {
        throw new Error(accountData.error || "Could not update account status.");
      }

      const updateNote = cancelling
        ? cancellationNote({ finalCleaningDate, reason: cancellationReason, notes: cleanReason })
        : "Status changed from " +
          oldStatus +
          " to " +
          newStatus +
          "." +
          (cleanReason ? " Reason: " + cleanReason : "");

      const updateResponse = await fetch("/api/account-updates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addAccountUpdate",
          accountId: accountId,
          accountName: accountName,
          updateType: "Status Change",
          manager: account.manager || "",
          notes: updateNote,
          notifyEmail: "No",
        }),
      });

      const updateData = await readApiResponse(updateResponse);

      if (!updateResponse.ok || updateData.success === false) {
        throw new Error(
          updateData.error ||
            "Status changed, but the history note could not be saved."
        );
      }

      setAccount((current) =>
        current
          ? {
              ...current,
              status: newStatus,
              // Any other status clears them on the server too.
              finalCleaningDate: cancelling ? finalCleaningDate : "",
              cancellationReason: cancelling ? cancellationReason : "",
            }
          : current
      );

      if (newStatus === "Cancelled") {
        try {
          let targetSheetRow = portalSheetRow;

          if (targetSheetRow == null) {
            const match = await fetchPortalAccountMatch(accountName);
            targetSheetRow = match.sheetRow;
          }

          if (targetSheetRow != null) {
            const portalResponse = await fetch("/api/admin/portal-accounts", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sheetRow: targetSheetRow,
                action: "toggleAccess",
                currentAccess: "YES",
              }),
            });

            const portalData = await readPortalActionResponse(portalResponse);

            if (portalResponse.ok && portalData.success !== false) {
              setPortalSheetRow(targetSheetRow);
              setPortalAccess("NO");
            }
          }
        } catch {
          // Do not block the status change if portal access could not be updated.
        }
      }

      setStatusMessage("Status changed and history note saved.");
      setShowStatusModal(false);
      showToast(CHEER.logged);
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? err.message
          : "Something went wrong changing the account status."
      );
      // After an Undo wait the sheet is closed: open it again so the error and its Try again are seen.
      setShowStatusModal(true);
    } finally {
      setSavingStatus(false);
    }
  }

  // Cancelling an account is hard to take back, so it waits 5 seconds behind
  // an Undo button before anything is saved. Every other status saves at once.
  function requestStatusSave() {
    if (!account) return;
    if (newStatus !== "Cancelled" || cleanText(account.status) === "Cancelled") {
      void handleSaveStatusChange();
      return;
    }
    const problem = statusProblem();
    if (problem) {
      setStatusError(problem);
      return;
    }
    setStatusError("");
    setShowStatusModal(false);
    undoable({
      message: `Cancelling ${cleanText(account.accountName) || "this account"}…`,
      run: () => handleSaveStatusChange(),
      onUndo: () => setShowStatusModal(true),
      undoneMessage: "Not cancelled. Nothing was changed.",
    });
  }

  if (loading) {
    return (
      <Screen title="Account" backHref="/accounts">
        <SkeletonList rows={4} />
      </Screen>
    );
  }

  if (error || !account) {
    return (
      <Screen title="Account" backHref="/accounts">
        <ErrorBox title="We could not open this account." text={error || "Could not find this account."} />
        <div>
          <BigButton kind="second" href="/accounts">
            Back to accounts
          </BigButton>
        </div>
      </Screen>
    );
  }

  const accountName = account.accountName || "Unnamed Account";

  // This account on the New accounts board (null when it is not on it).
  const thisAccountId = getAccountId(account, rawAccountIdFromUrl);
  const grossMarginText = estimatedGrossMargin ? formatCalculatedMoney(estimatedGrossMargin) : account.grossMargin || "N/A";
  const addressLink = accountAddress ? (
    <a href={getGoogleMapsUrl(accountAddress)} target="_blank" rel="noopener noreferrer" className="ui-link">
      {accountAddress}
    </a>
  ) : (
    "N/A"
  );
  const phoneLink = (
    <a href={makeTelLink(contactPhone)} className="ui-link">
      {contactPhone}
    </a>
  );

  return (
    <>
      <AccountPacketPrintView
        accountName={account.accountName || ""}
        address={accountAddress}
        startDate={startDate}
        cleaningSchedule={cleaningDays}
        subcontractor={subcontractorContactDisplay}
        monthlySubcontractorPay={formatMoney(subcontractorPay)}
        hasKey={account.hasKey || ""}
        alarmInfo={alarmInfo}
        scope={account.scope || account.scopeOfWork || ""}
        manager={account.manager || ""}
      />

      {activeTab === "details" && (
        <div className="account-detail-print">
          <Screen
            title={accountName}
            backHref="/accounts"
            onEdit={() => router.push(`/accounts/${accountIdForUrl}/edit`)}
          >
            {/* Active and no Sub Schedule: Coverage cannot count it. Nothing shows otherwise. */}
            <NoScheduleBanner accountId={getAccountId(account, rawAccountIdFromUrl)} />
            <Tips
              id="account"
              steps={[
                { target: '[data-tip="call"]', text: "Tap a green tile to do that thing. This one calls the contact." },
                { target: '[data-tip="more"]', text: "Tap More for everything else: money, history, onboarding, portal and printing." },
                { target: '.cw-topbar-btn[aria-label="Edit"]', text: "Tap Edit at the top to change anything about this account." },
              ]}
            />

            <NextCleaning
              accountId={getAccountId(account, rawAccountIdFromUrl)}
              cleaningDays={cleaningDays}
              frequency={cleaningFrequency}
              sub={subcontractorContactDisplay}
              subCompany={subcontractorCompanyDisplay}
              manager={account.manager || ""}
              cancelled={isCancelledStatus(account.status)}
              finalCleaningDate={isCancelledStatus(account.status) ? account.finalCleaningDate || "" : ""}
            >
              {/* Gold "Ready to start" (lib/setupWizard.ts isReadyToStart); nothing otherwise. */}
              <SetupReadyBadge accountId={thisAccountId} refreshKey={welcomeVersion + flowVersion} />
              {/* The Snapshot and the More button live in the banner. */}
              <div className="ui-next-snapshot" data-account-snapshot>
                <p className="ui-next-label">Snapshot</p>
                <dl className="ui-details">
                  {contactsOn ? null : (
                    <>
                      <Detail label="Contact Person" value={contactPerson} />
                      <Detail label="Phone" value={phoneLink} />
                      <Detail label="Email" value={contactEmail} />
                    </>
                  )}
                  <Detail label="Start Date" value={startDate} />
                  <Detail label="Cleaning Days" value={cleaningDays} />
                  <Detail label="Cleaning Time" value={describeCleaningTime(account.cleaningTime) || "Not set"} />
                  <Detail label="Frequency" value={cleaningFrequency} />
                  <TimeOnSiteDetail accountId={getAccountId(account, rawAccountIdFromUrl)} />
                  <Detail label="CW Pay" value={formatMoney(account.monthlyRevenue)} />
                  <Detail label="Subcontractor Pay" value={`${formatMoney(subcontractorPay)} (${share.subPercent})`} />
                  <Detail label="We keep" value={`${formatCalculatedMoney(share.keep)} (${share.keepPercent})`} />
                  <Detail label="Sub price per cleaning" value={perCleaningText} />
                  <Detail label="Has Key" value={account.hasKey || "N/A"} />
                  <Detail label="Alarm Info" value={alarmInfo || "N/A"} />
                  <Detail label="Address" value={addressLink} full />
                </dl>
              </div>
              <div className="account-detail-print-hide" style={{ marginTop: 12 }}>
                <BigButton
                  kind="second"
                  onClick={() => setShowMore((value) => !value)}
                  aria-expanded={showMore}
                  aria-controls="account-more"
                  data-tip="more"
                >
                  {showMore ? "Less" : "More"}
                </BigButton>
              </div>
            </NextCleaning>

            {/* A new account from "New Accepted Account": its 8 steps and the one green button. Nothing for other accounts. */}
            <AccountFlowPanel
              accountId={thisAccountId}
              refreshKey={welcomeVersion + flowVersion}
              onSendPacket={() => setShowWelcomePacket(true)}
              onOpenChecklist={() => setShowOnboardingWizard(true)}
            />

            {/* The old 7-step "New account" card is retired (migration 051): new accounts use the 8-step flow above. */}

            <div className="ui-actions-row">
              <StatusPill kind={accountStatusKind(account.status)}>{account.status || "No Status"}</StatusPill>
              <StatusPill kind={accountHealthKind(account.accountHealth)}>{account.accountHealth || "No Health Status"}</StatusPill>
            </div>
            {/* "At risk" and the other reminders for this account. Active accounts only, staff only. */}
            <div className="account-detail-print-hide">
              <AccountSignals accountId={thisAccountId} active={String(account.status ?? "").trim().toLowerCase() === "active"} />
            </div>
            {/* The full name: the bar at the top shortens long ones. */}
            <div>
              <p className="ui-acct-name">{accountName}</p>
              {accountAddress ? <p className="ui-muted">{addressLink}</p> : null}
            </div>

            {statusMessage ? (
              <p className="ui-savestatus ui-savestatus-saved account-detail-print-hide" role="status">
                {statusMessage}
              </p>
            ) : null}
            {portalAccessError ? (
              <div className="account-detail-print-hide">
                <ErrorBox title="Portal access was not changed." text={portalAccessError} onRetry={() => void handleTogglePortalAccess()} />
              </div>
            ) : null}

            {/* The six things people do most, one tap each. */}
            <div className="ui-acttiles account-detail-print-hide">
              <Tile
                icon="call"
                label="Call contact"
                detail={hasContactPhone ? (contactPerson !== "N/A" ? contactPerson : contactPhone) : "No phone on file"}
                href={hasContactPhone ? makeTelLink(contactPhone) : undefined}
                external
                disabled={!hasContactPhone}
                data-tip="call"
              />
              <Tile icon="todo" label="Add to-do" onClick={() => setShowToDo(true)} />
              <Tile icon="problem" label="Log problem" href={accountComplaintLink} />
              <Tile icon="visit" label="Log visit" href={`/visits/new?accountId=${accountIdForUrl}&account=${accountNameForUrl}`} />
              <Tile icon="money" label="+ Extra job" href={`/extra-jobs/new?accountId=${accountIdForUrl}`} />
              <Tile icon="key" label="Keys and alarm" onClick={() => setShowKeys(true)} />
            </div>

            {/* Visits, updates, extra jobs, complaints, supply orders, photos, to-dos and sales of this account, with how many. */}
            <AccountEverything accountId={thisAccountId} accountName={accountName} />

            <QuickToDoSheet
              open={showToDo}
              onClose={() => setShowToDo(false)}
              accountId={getAccountId(account, rawAccountIdFromUrl)}
              accountName={accountName}
              manager={account.manager}
            />

            <Sheet open={showKeys} title="Keys and alarm" text={accountName} onClose={() => setShowKeys(false)}>
              <dl className="ui-details">
                <Detail label="Has Key" value={account.hasKey || "N/A"} />
                <Detail label="Alarm Info" value={alarmInfo || "N/A"} full />
              </dl>
              <BigButton kind="second" href={`/accounts/${accountIdForUrl}/edit`}>
                Change keys or alarm
              </BigButton>
            </Sheet>

            {/* Everything else lives behind the More tile. */}
            <div id="account-more" hidden={!showMore} className="ui-screen-body">
              <h2 className="ui-section-title account-detail-print-hide">More for this account</h2>

              <div className="ui-more-actions account-detail-print-hide">
                <BigButton kind="second" onClick={openStatusModal}>
                  Change status
                </BigButton>
                <BigButton kind="second" icon="plus" href={`/account-updates?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}>
                  Add update
                </BigButton>
                <BigButton kind="second" icon="plus" href={`/sales?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}>
                  Add sale
                </BigButton>
                <BigButton kind="second" onClick={() => (pinInfo ? setShowPrintChoice(true) : openPdfModal())}>
                  Print PDF
                </BigButton>
                <BigButton kind="second" onClick={() => setShowSubPacket(true)}>
                  Send Sub Packet
                </BigButton>
                <BigButton kind="second" icon={welcomeSentAt ? "check" : undefined} onClick={() => setShowWelcomePacket(true)}>
                  {welcomeSentAt ? `Customer Welcome Packet: Sent ${welcomeSentLabel(welcomeSentAt)}` : "Send Customer Welcome Packet"}
                </BigButton>
                <BigButton
                  kind="second"
                  icon={portalAccess === "YES" ? "check" : "off"}
                  busy={togglingPortalAccess}
                  busyLabel="Updating portal access…"
                  onClick={() => void handleTogglePortalAccess()}
                >
                  {`Portal access: ${portalAccess === "YES" ? "ON" : "OFF"}`}
                </BigButton>
                {/* Prices are before sales tax; ON = the customer sees the price with no tax note (migration 065). */}
                <TaxExemptButton accountId={thisAccountId} />
                <BigButton kind="second" icon={portalInvites[0] ? "check" : undefined} onClick={() => setShowPortalInvite(true)}>
                  {portalInvites[0] ? `Invite to portal: ${invitedLine(portalInvites[0])}` : "Invite to portal"}
                </BigButton>
                {/* The customer portal as this account's customer sees it, read only, in a new tab (lib/portalPreview.ts). */}
                <a className="ui-btn ui-btn-second" href={`/api/admin/portal-preview?accountId=${encodeURIComponent(thisAccountId)}`} target="_blank" rel="noopener">
                  <span>👁 View as customer</span>
                </a>
                {/* Shared preview links of this account (made from the View as customer bar): active / Turn off. */}
                <PreviewLinks accountId={thisAccountId} />
                <BigButton kind="second" onClick={() => setShowOnboardingWizard(true)}>
                  Onboarding checklist
                </BigButton>
                <BigButton kind="second" onClick={() => setShowFullAccountInfo(true)}>
                  Full account info
                </BigButton>
                <PhotosLink accountId={thisAccountId} accountName={accountName} />
                <SupplyMode accountId={thisAccountId} accountName={accountName} />
                <PinButton info={pinInfo} type="account" record={{ recordId: thisAccountId, title: accountName, accountId: thisAccountId, accountName, forWho: account.manager || "" }} managerName={account.manager || ""} />
              </div>

              {/* Last, on its own row and normal size: red words and outline, never a big red block. */}
              <div className="account-detail-print-hide" style={{ marginTop: 16 }}>
                <button type="button" className="ui-btn ui-btn-delete" onClick={() => setShowDeleteAccount(true)}>
                  Delete account
                </button>
              </div>

              {/* What is at this site, + Add delivery, a corrected count, and its history. */}
              <SiteStock accountId={thisAccountId} accountName={accountName} />

              <Card title="Money">
                <div className="ui-stats">
                  <div className="ui-stat">
                    <p className="ui-stat-label">Monthly Revenue</p>
                    <p className="ui-stat-value">{formatMoney(account.monthlyRevenue)}</p>
                  </div>
                  <div className="ui-stat">
                    <p className="ui-stat-label">Sub Pay</p>
                    <p className="ui-stat-value">{formatMoney(subcontractorPay)}</p>
                    <p className="ui-muted">({share.subPercent})</p>
                  </div>
                  <div className="ui-stat">
                    <p className="ui-stat-label">Est. Gross Margin</p>
                    <p className="ui-stat-value">{grossMarginText}</p>
                    <p className="ui-muted">({share.keepPercent})</p>
                  </div>
                </div>
              </Card>

            {/* Everyone on this account. One contact shows simply; two or more show as a list with roles. */}
            <AccountContacts accountId={thisAccountId} accountName={accountName} onMain={followMainContact} onReady={contactsReady} />

            <Card title="Notes">
              <p className="ui-card-text">Internal account notes.</p>
              <p style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{account.notes || "No notes added for this account yet."}</p>
            </Card>

            {/* --------------------------------------------------------------- */}
            {/* Setup: "X of Y done", what is missing, and the button to the     */}
            {/* setup wizard (the Onboarding Checklist). Every account has it,  */}
            {/* old ones too; the answers are this account's own fields.        */}
            {/* --------------------------------------------------------------- */}
            {/* "Add accepted estimate" (the old 7-step board) is retired: a new account is made with New Accepted Account. */}

            <section className="ui-card account-detail-print-hide">
              <OnboardingChecklist
                accountId={thisAccountId}
                accountName={accountName}
                variant="section"
                refreshKey={welcomeVersion + flowVersion}
                onOpenWizard={() => setShowOnboardingWizard(true)}
              />
            </section>

            {/* --------------------------------------------------------------- */}
            {/* Porter Checklist template editor — the component itself fetches  */}
            {/* the account's live "Checklist Needed" flag and renders nothing   */}
            {/* when it's off, so no gating is needed here.                      */}
            {/* --------------------------------------------------------------- */}
            <section className="account-detail-print-hide">
              <ChecklistTemplateEditor accountId={getAccountId(account, rawAccountIdFromUrl)} accountName={accountName} />
            </section>

            <SitePhotos accountId={thisAccountId} accountName={accountName} />

            {/* Every save: who, when, and each field's old → new value. */}
            <div className="account-detail-print-hide">
              <AccountHistory key={welcomeVersion} accountId={getAccountId(account, rawAccountIdFromUrl)} />
            </div>

            <SubPacketSheet open={showSubPacket} accountId={thisAccountId} accountName={accountName} onClose={() => setShowSubPacket(false)} />

            <PortalInviteSheet
              open={showPortalInvite}
              accountId={thisAccountId}
              accountName={accountName}
              onClose={() => setShowPortalInvite(false)}
              onInvited={(invites) => {
                setPortalInvites(invites);
                // The invite is a new line in History.
                setWelcomeVersion((version) => version + 1);
              }}
            />

            <WelcomePacketSheet
              open={showWelcomePacket}
              accountId={thisAccountId}
              accountName={accountName}
              onClose={() => setShowWelcomePacket(false)}
              onSent={(sentAt) => {
                setWelcomeSentAt(sentAt);
                setWelcomeVersion((version) => version + 1);
              }}
            />

            <DeleteAccountSheet
              open={showDeleteAccount}
              accountId={thisAccountId}
              onClose={() => setShowDeleteAccount(false)}
              onDeleted={(name) => {
                setShowDeleteAccount(false);
                showToast(`${name} deleted. Settings → Deleted accounts can restore it.`);
                router.push("/accounts");
              }}
            />

            </div>

            {showOnboardingWizard ? (
              <OnboardingWizardModal
                accountId={thisAccountId}
                accountName={accountName}
                onChanged={() => {
                  setupChanged.current = true;
                  // The tracker above follows the wizard's taps.
                  setFlowVersion((version) => version + 1);
                }}
                onClose={() => {
                  setShowOnboardingWizard(false);
                  // The account's own fields (days, pay, contact, ...) were saved by the wizard: read them again.
                  if (setupChanged.current) {
                    setupChanged.current = false;
                    setAccountVersion((version) => version + 1);
                  }
                }}
              />
            ) : null}

            <Sheet
              open={showFullAccountInfo}
              title="Full Account Info"
              text={`Complete account reference information for ${accountName}.`}
              onClose={() => setShowFullAccountInfo(false)}
            >
              <dl className="ui-details">
                <Detail label="Account ID" value={String(account.accountId || account.id || account.rowNumber || "N/A")} />
                <Detail label="Status" value={account.status || "N/A"} />
                <Detail label="Address" value={addressLink} full />
                <Detail label="Contact Person" value={contactPerson} />
                <Detail label="Phone" value={phoneLink} />
                <Detail label="Email" value={contactEmail} />
                <Detail label="Manager" value={account.manager || "N/A"} />
                <Detail label="Subcontractor" value={subcontractorContactDisplay} />
                <Detail label="Start Date" value={startDate} />
                <Detail label="Cleaning Days" value={cleaningDays} />
                <Detail label="Cleaning Time" value={describeCleaningTime(account.cleaningTime) || "Not set"} />
                <Detail label="Frequency" value={cleaningFrequency} />
                <Detail label="Monthly Revenue" value={formatMoney(account.monthlyRevenue)} />
                <Detail label="Subcontractor Pay" value={`${formatMoney(subcontractorPay)} (${share.subPercent})`} />
                <Detail label="Sub price per cleaning" value={perCleaningText} />
                <Detail label="Estimated Gross Margin" value={`${grossMarginText} (${share.keepPercent})`} />
                <Detail label="Has Key" value={account.hasKey || "N/A"} />
                <Detail label="Alarm Info" value={alarmInfo || "N/A"} full />
                <Detail label="Scope / Special Instructions" value={account.scope || "N/A"} full />
                <Detail label="Notes" value={account.notes || "N/A"} full />
              </dl>
            </Sheet>

            <Sheet
              open={showStatusModal}
              title="Change status"
              text={`${accountName}. Current status: ${account.status || "N/A"}.`}
              onClose={closeStatusModal}
              busy={savingStatus}
              actions={
                <BigButton busy={savingStatus} busyLabel="Saving…" onClick={requestStatusSave}>
                  Save status change
                </BigButton>
              }
            >
              <SelectField
                label="New status"
                value={newStatus}
                onChange={(event) => setNewStatus(event.target.value as QuickStatusOption)}
                disabled={savingStatus}
              >
                {quickStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </SelectField>
              {newStatus === "Cancelled" ? (
                <CancellationFields
                  finalCleaningDate={finalCleaningDate}
                  reason={cancellationReason}
                  disabled={savingStatus}
                  onFinalCleaningDate={setFinalCleaningDate}
                  onReason={setCancellationReason}
                />
              ) : null}
              <TextAreaField
                label={newStatus === "Cancelled" ? "Notes" : "Reason / history note"}
                hint="This will also create an Account Update history note."
                optional={newStatus !== "Cancelled" || cancellationReason !== "Other"}
                rows={5}
                placeholder="Customer requested cancellation effective July 1. / Paused due to remodeling. / Account needs review due to service concern."
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
                disabled={savingStatus}
              />
              {statusError ? <ErrorBox title="The status was not changed." text={statusError} onRetry={requestStatusSave} /> : null}
            </Sheet>

            {pinInfo ? (
              <PrintOrPinSheet
                open={showPrintChoice}
                info={pinInfo}
                account={{ id: thisAccountId, name: accountName }}
                onClose={() => setShowPrintChoice(false)}
                onPrint={openPdfModal}
                onPinned={() => void reloadPinInfo()}
              />
            ) : null}

            <Sheet
              open={showPdfModal}
              title="Print account packet"
              text={`${accountName}. Choose which version to print.`}
              onClose={closePdfModal}
              busy={printingVariant !== null}
            >
              <Card
                title={printingVariant === "teamLeader" ? "Preparing…" : "Team Leader PDF"}
                onClick={printingVariant === null ? () => void handlePrintPacket("teamLeader") : undefined}
              >
                <p className="ui-card-text">Account details, access info, and scope of work. Safe to hand to a subcontractor.</p>
              </Card>
              <Card
                title={printingVariant === "admin" ? "Preparing…" : "Admin PDF"}
                right={<StatusPill kind="needs-you">Internal only</StatusPill>}
                onClick={printingVariant === null ? () => void handlePrintPacket("admin") : undefined}
              >
                <p className="ui-card-text">
                  Everything above, plus revenue, margin, subcontractor company, and internal notes. Internal use only —
                  never share with a subcontractor.
                </p>
              </Card>
              {pdfError ? <ErrorBox title="The PDF could not be made." text={pdfError} /> : null}
            </Sheet>

            {/* Off-screen (not display:none/zero-size, which can keep some
                browsers' embedded PDF viewers from initializing) target for
                handlePrintPacket's fetch-blob -> load -> print() flow. Never
                shown to the user; exists purely so window.print() has a PDF
                document to act on. */}
            <iframe
              ref={printIframeRef}
              title="Account packet print preview"
              className="account-detail-print-hide"
              style={{
                position: "fixed",
                top: "-9999px",
                left: "-9999px",
                width: 1,
                height: 1,
                opacity: 0,
                border: 0,
                pointerEvents: "none",
              }}
            />
          </Screen>
        </div>
      )}
    </>
  );
}

function Detail({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "ui-detail ui-detail-full" : "ui-detail"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
