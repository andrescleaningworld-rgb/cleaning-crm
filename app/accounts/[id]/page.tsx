"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BigButton,
  Card,
  ErrorBox,
  MoreMenu,
  Screen,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  TextAreaField,
  type StatusKind,
} from "@/app/ui";
import { useParams, useSearchParams } from "next/navigation";
import { getGoogleMapsUrl } from "../../lib/backend";
import { AccountPacketPrintView } from "./account-packet-print-view";
import OnboardingChecklist from "../../components/OnboardingChecklist";
import OnboardingWizardModal from "../../components/OnboardingWizardModal";
import ChecklistTemplateEditor from "../../components/ChecklistTemplateEditor";
import AccountHistory from "../../components/AccountHistory";

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

type QuickStatusOption =
  | "Active"
  | "Cancelled"
  | "Paused"
  | "Over 90 Days"
  | "Inactive"
  | "Needs Review"
  | "Other";

const quickStatusOptions: QuickStatusOption[] = [
  "Active",
  "Cancelled",
  "Paused",
  "Over 90 Days",
  "Inactive",
  "Needs Review",
  "Other",
];

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

  if (clean.includes("cancel") || clean.includes("inactive") || clean.includes("lost")) return "needs-you";
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
  const searchParams = useSearchParams();
  const rawAccountIdFromUrl = String(params?.id || "");
  const decodedAccountIdFromUrl = decodeURIComponent(rawAccountIdFromUrl);
  const normalizedUrlValue = normalizeValue(decodedAccountIdFromUrl);

  const [account, setAccount] = useState<Account | null>(null);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  // Team Hub tab hidden 2026-09-24 (Crew Link replaces it) — the page
  // always shows Details; ./team-hub-tab.tsx is kept, just not rendered.
  const activeTab = "details" as const;
  const [sendingPacket, setSendingPacket] = useState(false);
  // Customer portal invite ("Set your password" email): what the server answered, shown in a sheet.
  const [sendingPortalInvite, setSendingPortalInvite] = useState(false);
  const [portalInvite, setPortalInvite] = useState<{ ok: boolean; message: string; devLink?: string } | null>(null);
  const [error, setError] = useState("");
  const [packetMessage, setPacketMessage] = useState("");
  const [packetError, setPacketError] = useState("");
  const [showPdfModal, setShowPdfModal] = useState(false);
  // Which variant is currently being fetched/printed, if any — also doubles
  // as the "an action is in flight" flag that disables both choice buttons.
  const [printingVariant, setPrintingVariant] = useState<"teamLeader" | "admin" | null>(null);
  const [pdfError, setPdfError] = useState("");
  const printIframeRef = useRef<HTMLIFrameElement>(null);
  const [showFullAccountInfo, setShowFullAccountInfo] = useState(false);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<QuickStatusOption>("Active");
  const [statusReason, setStatusReason] = useState("");
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
        setPacketMessage("");
        setPacketError("");

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
  }, [decodedAccountIdFromUrl, normalizedUrlValue]);

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

  async function handleSendPortalInvite() {
    if (sendingPortalInvite) return;
    setSendingPortalInvite(true);
    try {
      const res = await fetch("/api/admin/portal-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: decodeURIComponent(accountIdForUrl) }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string; devLink?: string };
      setPortalInvite({
        ok: res.ok && data.success === true,
        message: data.success ? data.message || "Invite sent." : data.error || "Failed to send the invite.",
        devLink: data.devLink,
      });
    } catch {
      setPortalInvite({ ok: false, message: "Failed to send the invite." });
    } finally {
      setSendingPortalInvite(false);
    }
  }

  async function handleSendNewAccountPacket() {
    if (!account) return;

    try {
      setSendingPacket(true);
      setPacketMessage("");
      setPacketError("");

      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "sendNewAccountPacket",
          accountId:
            account.accountId ||
            account.id ||
            account.rowNumber ||
            account.accountName ||
            rawAccountIdFromUrl,
          accountName: account.accountName || "",
          address: accountAddress,
          startDate,
          cleaningSchedule: cleaningDays,
          subcontractor: account.subcontractor || "",
          subcontractorEmail: account.subcontractorEmail || "",
          monthlySubcontractorPay: subcontractorPay,
          hasKey: account.hasKey || "",
          alarmInfo,
          scope: account.scope || account.notes || "",
          notes: account.notes || "",
          manager: account.manager || "",
        }),
      });

      const data = await readApiResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Could not send new account packet.");
      }

      setPacketMessage(data.message || "New account packet sent successfully.");
    } catch (err) {
      setPacketError(
        err instanceof Error
          ? err.message
          : "Something went wrong sending the new account packet."
      );
    } finally {
      setSendingPacket(false);
    }
  }

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
    setStatusError("");
    setStatusMessage("");
    setShowStatusModal(true);
  }

  function closeStatusModal() {
    if (savingStatus) return;

    setShowStatusModal(false);
    setStatusReason("");
    setStatusError("");
  }

  async function handleSaveStatusChange() {
    if (!account) return;

    const cleanReason = statusReason.trim();

    if (!cleanReason) {
      setStatusError("Please add a reason/note for the status change.");
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
          fields: { status: newStatus },
        }),
      });

      const accountData = await readApiResponse(accountResponse);

      if (!accountResponse.ok || accountData.success === false) {
        throw new Error(accountData.error || "Could not update account status.");
      }

      const updateNote =
        "Status changed from " +
        oldStatus +
        " to " +
        newStatus +
        ". Reason: " +
        cleanReason;

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
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? err.message
          : "Something went wrong changing the account status."
      );
    } finally {
      setSavingStatus(false);
    }
  }

  // Fired once by OnboardingChecklist the moment its last item becomes
  // checked, with a consolidated summary of every note left on the
  // checklist ("" if none). Reuses the exact same two-call path
  // handleSaveStatusChange above uses (updateAccountFields, then
  // addAccountUpdate for the history note) rather than a new update
  // mechanism — just targeting Account Health, since "Stable" is a value of
  // that field, not of Status (Status's valid values are Active/Cancelled/
  // Paused/Over 90 Days/Inactive/Needs Review/Other — "Stable" was never one
  // of them).
  //
  // The notes summary rides along in this SAME addAccountUpdate call rather
  // than its own — account-updates emails info@/crm@ on every call
  // regardless of the notifyEmail flag (confirmed live), so per-note-save
  // history logging was removed entirely (see OnboardingChecklist's
  // saveItem) in favor of exactly one call/email for the whole checklist,
  // fired here at completion.
  async function applyOnboardingCompletionStable(notesSummary: string) {
    if (!account) return;

    const accountId = getAccountId(account, rawAccountIdFromUrl);
    const accountName = cleanText(account.accountName) || "Unnamed Account";

    try {
      const accountResponse = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateAccountFields",
          accountId,
          fields: { accountHealth: "Stable" },
        }),
      });

      const accountData = await readApiResponse(accountResponse);
      if (!accountResponse.ok || accountData.success === false) {
        throw new Error(accountData.error || "Could not update Account Health.");
      }

      setAccount((current) => (current ? { ...current, accountHealth: "Stable" } : current));

      const completionNote = "Onboarding checklist completed — Account Health automatically set to Stable.";
      const notes = notesSummary ? `${completionNote}\n\n${notesSummary}` : completionNote;

      await fetch("/api/account-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addAccountUpdate",
          accountId,
          accountName,
          updateType: "Onboarding",
          manager: account.manager || "",
          notes,
          notifyEmail: "No",
        }),
      }).catch(() => {
        // Best-effort — Account Health already saved above; a failed
        // history write here isn't worth blocking the completion banner.
      });

      // Idempotency flag so a later reload of this (already-complete)
      // checklist never re-fires this whole side effect again.
      await fetch("/api/onboarding-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAutoStableApplied", accountId }),
      }).catch(() => {});

      setStatusMessage("🎉 Onboarding complete — Account Health automatically set to Stable.");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Onboarding checklist completed, but Account Health could not be updated automatically: ${err.message}`
          : "Onboarding checklist completed, but Account Health could not be updated automatically."
      );
    }
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
            subtitle="Cleaning World Account"
            backHref="/accounts"
            headerRight={
              <span className="account-detail-print-hide">
                <MoreMenu
                  items={[
                    { label: "Change status", onSelect: openStatusModal },
                    {
                      label: togglingPortalAccess ? "Updating portal access…" : `Portal access: ${portalAccess === "YES" ? "ON" : "OFF"}`,
                      icon: portalAccess === "YES" ? "check" : "off",
                      onSelect: () => void handleTogglePortalAccess(),
                    },
                    { label: "Print PDF", onSelect: openPdfModal },
                    {
                      label: sendingPacket ? "Sending packet…" : "Send new account packet",
                      onSelect: () => void handleSendNewAccountPacket(),
                    },
                    {
                      label: sendingPortalInvite ? "Sending portal invite…" : "Send portal invite",
                      onSelect: () => void handleSendPortalInvite(),
                    },
                    { label: "Onboarding checklist", onSelect: () => setShowOnboardingWizard(true) },
                    { label: "Add sale", icon: "plus", href: `/sales?accountId=${accountIdForUrl}&account=${accountNameForUrl}` },
                    { label: "Full account info", onSelect: () => setShowFullAccountInfo(true) },
                  ]}
                />
                <Sheet
                  open={portalInvite !== null}
                  title={portalInvite?.ok ? "Portal invite" : "Portal invite not sent"}
                  text={portalInvite?.message}
                  onClose={() => setPortalInvite(null)}
                >
                  {portalInvite?.devLink ? (
                    <div className="ui-stack">
                      <p>Test account: emails are not sent here. This is the link the email would carry.</p>
                      <p className="ui-code">{portalInvite.devLink}</p>
                    </div>
                  ) : null}
                </Sheet>
              </span>
            }
            action={
              <span className="account-detail-print-hide" style={{ display: "contents" }}>
                <BigButton href={`/accounts/${accountIdForUrl}/edit`}>Edit account</BigButton>
              </span>
            }
          >
            {accountAddress ? <p className="ui-muted">{addressLink}</p> : null}

            <div className="ui-actions-row">
              <StatusPill kind={accountStatusKind(account.status)}>{account.status || "No Status"}</StatusPill>
              <StatusPill kind={accountHealthKind(account.accountHealth)}>{account.accountHealth || "No Health Status"}</StatusPill>
            </div>

            <div className="ui-actions-row account-detail-print-hide">
              <BigButton kind="second" icon="plus" href={`/visits?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}>
                Add visit
              </BigButton>
              <BigButton kind="second" icon="plus" href={accountComplaintLink}>
                Add complaint
              </BigButton>
              <BigButton kind="second" icon="plus" href={`/account-updates?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}>
                Add update
              </BigButton>
            </div>

            {packetMessage ? (
              <p className="ui-savestatus ui-savestatus-saved account-detail-print-hide" role="status">
                {packetMessage}
              </p>
            ) : null}
            {statusMessage ? (
              <p className="ui-savestatus ui-savestatus-saved account-detail-print-hide" role="status">
                {statusMessage}
              </p>
            ) : null}
            {packetError ? (
              <div className="account-detail-print-hide">
                <ErrorBox title="The packet was not sent." text={packetError} onRetry={() => void handleSendNewAccountPacket()} />
              </div>
            ) : null}
            {portalAccessError ? (
              <div className="account-detail-print-hide">
                <ErrorBox title="Portal access was not changed." text={portalAccessError} onRetry={() => void handleTogglePortalAccess()} />
              </div>
            ) : null}

            <div className="ui-stats">
              <div className="ui-stat">
                <p className="ui-stat-label">Manager</p>
                <p className="ui-stat-value">{account.manager || "Unassigned"}</p>
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Subcontractor</p>
                <p className="ui-stat-value">{subcontractorContactDisplay}</p>
                {subcontractorCompanyDisplay ? <p className="ui-muted">{subcontractorCompanyDisplay}</p> : null}
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Monthly Revenue</p>
                <p className="ui-stat-value">{formatMoney(account.monthlyRevenue)}</p>
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Sub Pay</p>
                <p className="ui-stat-value">{formatMoney(subcontractorPay)}</p>
              </div>
              <div className="ui-stat">
                <p className="ui-stat-label">Est. Gross Margin</p>
                <p className="ui-stat-value">{grossMarginText}</p>
                {account.grossMarginPercent ? <p className="ui-muted">({account.grossMarginPercent.replace(/%$/, "")}%)</p> : null}
              </div>
            </div>

            <Card title="Account Snapshot">
              <p className="ui-card-text">Main operational details for this account.</p>
              <dl className="ui-details">
                <Detail label="Contact Person" value={contactPerson} />
                <Detail label="Phone" value={phoneLink} />
                <Detail label="Email" value={contactEmail} />
                <Detail label="Start Date" value={startDate} />
                <Detail label="Cleaning Days" value={cleaningDays} />
                <Detail label="Frequency" value={cleaningFrequency} />
                <Detail label="Subcontractor Pay" value={formatMoney(subcontractorPay)} />
                <Detail label="Has Key" value={account.hasKey || "N/A"} />
                <Detail label="Alarm Info" value={alarmInfo || "N/A"} />
                <Detail label="Address" value={addressLink} full />
              </dl>
            </Card>

            <Card title="Notes">
              <p className="ui-card-text">Internal account notes.</p>
              <p style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{account.notes || "No notes added for this account yet."}</p>
            </Card>

            {/* --------------------------------------------------------------- */}
            {/* Onboarding section — persistent, always editable, revisitable    */}
            {/* even for accounts created before this feature existed. Renders   */}
            {/* the exact same OnboardingChecklist component the wizard modal    */}
            {/* uses, just inline rather than in a modal.                        */}
            {/* --------------------------------------------------------------- */}
            <section className="ui-card account-detail-print-hide">
              <OnboardingChecklist
                accountId={getAccountId(account, rawAccountIdFromUrl)}
                accountName={accountName}
                manager={account.manager}
                accountStartDate={account.accountStartDate || account.startDate || account.serviceStartDate}
                onAllItemsComplete={applyOnboardingCompletionStable}
                variant="section"
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

            {/* Every save: who, when, and each field's old → new value. */}
            <div className="account-detail-print-hide">
              <AccountHistory accountId={getAccountId(account, rawAccountIdFromUrl)} />
            </div>

            {showOnboardingWizard ? (
              <OnboardingWizardModal
                accountId={getAccountId(account, rawAccountIdFromUrl)}
                accountName={accountName}
                manager={account.manager}
                accountStartDate={account.accountStartDate || account.startDate || account.serviceStartDate}
                onAllItemsComplete={applyOnboardingCompletionStable}
                onClose={() => setShowOnboardingWizard(false)}
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
                <Detail label="Frequency" value={cleaningFrequency} />
                <Detail label="Monthly Revenue" value={formatMoney(account.monthlyRevenue)} />
                <Detail label="Subcontractor Pay" value={formatMoney(subcontractorPay)} />
                <Detail label="Estimated Gross Margin" value={grossMarginText} />
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
                <BigButton busy={savingStatus} busyLabel="Saving…" onClick={() => void handleSaveStatusChange()}>
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
              <TextAreaField
                label="Reason / history note"
                hint="This will also create an Account Update history note."
                optional
                rows={5}
                placeholder="Customer requested cancellation effective July 1. / Paused due to remodeling. / Account needs review due to service concern."
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
                disabled={savingStatus}
              />
              {statusError ? <ErrorBox title="The status was not changed." text={statusError} /> : null}
            </Sheet>

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
