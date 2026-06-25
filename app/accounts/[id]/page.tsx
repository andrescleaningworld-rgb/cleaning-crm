"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

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
  startDate?: string;
  serviceStartDate?: string;
  cleaningSchedule?: string;
  schedule?: string;
  frequency?: string;
  cleaningDays?: string;
  scope?: string;
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

function formatGrossMarginPercent(revenue: number, grossMargin: number) {
  if (!revenue || !grossMargin) return "N/A";

  const percent = (grossMargin / revenue) * 100;

  return `${percent.toFixed(1)}%`;
}

function buildGoogleMapsSearchUrl(address: string) {
  const cleanAddress = cleanText(address);

  if (!cleanAddress || cleanAddress === "N/A") return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    cleanAddress
  )}`;
}

function buildPhoneHref(phone: string) {
  const cleanPhone = cleanText(phone);

  if (!cleanPhone || cleanPhone === "N/A") return "";

  const phoneHref = cleanPhone.replace(/[^+\d]/g, "");

  return phoneHref ? `tel:${phoneHref}` : "";
}

function buildEmailHref(email: string) {
  const cleanEmail = cleanText(email);

  if (!cleanEmail || cleanEmail === "N/A" || !cleanEmail.includes("@")) {
    return "";
  }

  return `mailto:${cleanEmail}`;
}

function ClickablePhone({ value }: { value: string }) {
  const href = buildPhoneHref(value);

  if (!href) {
    return <>{value || "N/A"}</>;
  }

  return (
    <a
      href={href}
      className="text-blue-800 underline underline-offset-2 hover:text-blue-950"
    >
      {value}
    </a>
  );
}

function ClickableEmail({ value }: { value: string }) {
  const href = buildEmailHref(value);

  if (!href) {
    return <>{value || "N/A"}</>;
  }

  return (
    <a
      href={href}
      className="break-words text-blue-800 underline underline-offset-2 hover:text-blue-950"
    >
      {value}
    </a>
  );
}

function ClickableAddress({
  value,
  className = "text-blue-800 underline underline-offset-2 hover:text-blue-950",
}: {
  value: string;
  className?: string;
}) {
  const href = buildGoogleMapsSearchUrl(value);

  if (!href) {
    return <>{value || "N/A"}</>;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {value}
    </a>
  );
}

function getStatusClass(status: string | undefined) {
  const clean = String(status || "").toLowerCase();

  if (
    clean.includes("cancel") ||
    clean.includes("inactive") ||
    clean.includes("lost")
  ) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (clean.includes("active")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (clean.includes("pause")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getHealthClass(health: string | undefined) {
  const clean = String(health || "").toLowerCase();

  if (clean.includes("high risk")) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (clean.includes("attention")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (
    clean.includes("stable") ||
    clean.includes("good") ||
    clean.includes("excellent")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
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

export default function AccountDetailPage() {
  const params = useParams();
  const rawAccountIdFromUrl = String(params?.id || "");
  const decodedAccountIdFromUrl = decodeURIComponent(rawAccountIdFromUrl);
  const normalizedUrlValue = normalizeValue(decodedAccountIdFromUrl);

  const [account, setAccount] = useState<Account | null>(null);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingPacket, setSendingPacket] = useState(false);
  const [error, setError] = useState("");
  const [packetMessage, setPacketMessage] = useState("");
  const [packetError, setPacketError] = useState("");
  const [showFullAccountInfo, setShowFullAccountInfo] = useState(false);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<QuickStatusOption>("Active");
  const [statusReason, setStatusReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

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

    const fullAddress = [account.address, account.city, account.state, account.zip]
      .map((part) => cleanText(part))
      .filter(Boolean)
      .join(", ");

    return fullAddress;
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
    account?.startDate || account?.serviceStartDate || "Not provided";

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

  const contactEmail =
    account?.email ||
    account?.contactEmail ||
    account?.customerEmail ||
    "N/A";

  // Improved matching
  const matchedSubcontractor = useMemo(() => {
    if (!account?.subcontractor) return null;

    const accountSub = normalizeSubcontractorMatch(account.subcontractor);

    return (
      subcontractors.find((sub) => {
        const checks = [
          normalizeSubcontractorMatch(sub.companyName),
          normalizeSubcontractorMatch(sub.contactName),
          normalizeSubcontractorMatch(sub.name),
          normalizeSubcontractorMatch(sub.subcontractor),
          normalizeSubcontractorMatch(sub.displayName),
          normalizeSubcontractorMatch(sub.dropdownLabel),
        ];

        return checks.some((check) => 
          check === accountSub || 
          (check && accountSub && (check.includes(accountSub) || accountSub.includes(check)))
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

  // Improved send function
  async function handleSendNewAccountPacket() {
    if (!account) return;

    try {
      setSendingPacket(true);
      setPacketMessage("");
      setPacketError("");

      const sub = matchedSubcontractor || {};

      const payload = {
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
        subcontractor:
          sub.companyName ||
          sub.contactName ||
          sub.name ||
          account.subcontractor ||
          "",
        subcontractorEmail: sub.email || account.subcontractorEmail || "",
        monthlySubcontractorPay: subcontractorPay,
        hasKey: account.hasKey || "",
        alarmInfo,
        scope: account.scope || account.notes || "",
        notes: account.notes || "",
        manager: account.manager || "",
        triggeredBy: "User",
        userRole: "Admin",
      };

      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await readApiResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.message || "Could not send new account packet.");
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

      const updatedAccount: Account = {
        ...account,
        id: account.id || accountId,
        accountId: account.accountId || accountId,
        status: newStatus,
      };

      const accountResponse = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateAccount",
          account: updatedAccount,
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

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          Loading account...
        </p>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <Link
          href="/accounts"
          className="text-sm font-bold text-blue-800 hover:underline"
        >
          ← Back to Accounts
        </Link>

        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error || "Could not find this account."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/accounts"
          className="text-sm font-bold text-blue-800 hover:underline"
        >
          ← Back to Accounts
        </Link>
      </div>

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="bg-gradient-to-r from-blue-950 via-blue-800 to-sky-600 p-6 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-100">
                Cleaning World Account
              </p>

              <h1 className="mt-2 text-4xl font-black tracking-tight">
                {account.accountName || "Unnamed Account"}
              </h1>

              {accountAddress ? (
                <p className="mt-3 max-w-3xl text-sm font-medium text-blue-100">
                  <ClickableAddress
                    value={accountAddress}
                    className="text-blue-100 underline underline-offset-2 hover:text-white"
                  />
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                    account.status
                  )}`}
                >
                  {account.status || "No Status"}
                </span>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${getHealthClass(
                    account.accountHealth
                  )}`}
                >
                  {account.accountHealth || "No Health Status"}
                </span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
              <button
                onClick={handleSendNewAccountPacket}
                disabled={sendingPacket}
                className="rounded-2xl bg-emerald-300 px-4 py-3 text-center text-sm font-black text-slate-950 shadow-sm hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingPacket ? "Sending Packet..." : "Send New Account Packet"}
              </button>

              <Link
                href={`/accounts/${accountIdForUrl}/edit`}
                className="rounded-2xl bg-yellow-300 px-4 py-3 text-center text-sm font-black text-slate-950 shadow-sm hover:bg-yellow-200"
              >
                Edit Account
              </Link>

              <button
                type="button"
                onClick={openStatusModal}
                className="rounded-2xl bg-purple-200 px-4 py-3 text-center text-sm font-black text-purple-950 shadow-sm hover:bg-purple-100"
              >
                Change Status
              </button>

              <Link
                href={`/sales?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
                className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-blue-950 shadow-sm hover:bg-blue-50"
              >
                Add Sale
              </Link>

              <Link
                href={`/visits?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
                className="rounded-2xl bg-blue-100 px-4 py-3 text-center text-sm font-black text-blue-950 shadow-sm hover:bg-white"
              >
                Add Visit
              </Link>

              <Link
                href={accountComplaintLink}
                className="rounded-2xl bg-red-100 px-4 py-3 text-center text-sm font-black text-red-900 shadow-sm hover:bg-white"
              >
                Add Complaint
              </Link>

              <Link
                href={`/account-updates?accountId=${accountIdForUrl}&account=${accountNameForUrl}`}
                className="rounded-2xl bg-sky-100 px-4 py-3 text-center text-sm font-black text-blue-950 shadow-sm hover:bg-white"
              >
                Add Update
              </Link>

              <button
                type="button"
                onClick={() => setShowFullAccountInfo(true)}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-black text-slate-900 shadow-sm hover:bg-white"
              >
                Full Account Info
              </button>
            </div>
          </div>

          {packetMessage ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              {packetMessage}
            </div>
          ) : null}

          {packetError ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
              {packetError}
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              {statusMessage}
            </div>
          ) : null}
        </div>

        {/* Rest of your JSX remains the same */}
        {/* ... (the grid with Manager, Subcontractor, etc.) ... */}

      </section>

      {/* The rest of your component (modals, etc.) stays the same */}
      {/* ... */}

    </div>
  );
}