import { NextRequest, NextResponse } from "next/server";
import { getOrFetch } from "@/lib/serverCache";
import { fetchAppsScript } from "@/lib/appsScriptFetch";
import { fetchAccountsForAction, AccountsFetchError } from "@/app/api/accounts/route";
import { renderAccountPacketAdminPdf } from "@/lib/pdf/account-packet-admin";

// Admin-only, same reasoning as app/api/accounts/[id]/pdf/route.ts (the
// Team Leader variant): this path isn't in proxy.ts's PUBLIC_PATHS,
// SUB_PATHS, or SUB_OR_ADMIN_PATHS, so it falls through to the default
// admin-session-required branch. No auth code needed here, and this is
// deliberately NOT reachable from subcontractor-portal — self-service
// access for subcontractors is a separate, later feature.
export const maxDuration = 45;

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

type RouteContext = { params: Promise<{ id: string }> };

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/%20/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Matches app/accounts/[id]/page.tsx's normalizeSubcontractorMatch exactly —
// needed to reproduce the same subcontractor-directory lookup the admin
// page itself does when resolving a company name.
function normalizeSubcontractorMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function moneyToNumber(value: unknown): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/\$/g, "").replace(/,/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatMoney(value: unknown): string {
  const number = moneyToNumber(value);
  if (!number) return cleanText(value) || "N/A";
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatMoneyNumber(value: number): string {
  if (!value) return "N/A";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function slugifyFilenamePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim();
}

// Mirrors app/accounts/[id]/page.tsx's foundAccount matcher.
function findAccountByUrlId(
  accounts: Record<string, unknown>[],
  rawId: string
): Record<string, unknown> | undefined {
  const decoded = decodeURIComponent(rawId);
  const normalizedTarget = normalizeValue(decoded);

  return accounts.find((item) => {
    const itemId = normalizeValue(item.accountId ?? item.id);
    const itemRowNumber = normalizeValue(item.rowNumber);
    const itemName = normalizeValue(item.accountName);

    return (
      itemId === normalizedTarget ||
      itemRowNumber === normalizedTarget ||
      itemName === normalizedTarget ||
      cleanText(item.accountId ?? item.id) === decoded ||
      cleanText(item.rowNumber) === decoded ||
      cleanText(item.accountName) === decoded
    );
  });
}

// Deliberately its own minimal fetch, not a reuse of app/api/subcontractors's
// exported helper — that route's own cache entry is the full enriched
// (revenue-per-subcontractor) shape, and piggybacking on its cache key would
// mean silently receiving that shape if this route's request loses the race
// to populate the cache. This fetches and caches only the plain list, under
// its own dedicated key, so there's no ambiguity about what's in it.
async function fetchRawSubcontractors(): Promise<Record<string, unknown>[]> {
  if (!SCRIPT_URL) {
    throw new Error("Missing GOOGLE_SCRIPT_URL in .env.local");
  }

  const response = await fetchAppsScript(`${SCRIPT_URL}?action=getSubcontractors`, {
    method: "GET",
    cache: "no-store",
  });

  const text = await response.text();
  let data: { success?: boolean; error?: string; subcontractors?: unknown[]; data?: unknown[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Google Script did not return valid JSON while loading subcontractors.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || "Failed to load subcontractors from Google Script.");
  }

  return (data.subcontractors ?? data.data ?? []) as Record<string, unknown>[];
}

// Mirrors app/accounts/[id]/page.tsx's matchedSubcontractor +
// subcontractorCompanyDisplay derivation — same candidate fields, same
// "only show company if it differs from the contact display name" rule.
function findSubcontractorCompany(
  accountSubcontractorRaw: string,
  subs: Record<string, unknown>[]
): string {
  const target = normalizeSubcontractorMatch(accountSubcontractorRaw);
  if (!target) return "";

  const match = subs.find((sub) => {
    const candidates = [
      sub.companyName,
      sub.subcontractor,
      sub.displayName,
      sub.dropdownLabel,
      sub.contactName,
      sub.name,
    ];
    return candidates.some((candidate) => normalizeSubcontractorMatch(candidate) === target);
  });
  if (!match) return "";

  const companyName = cleanText(match.companyName);
  const contactDisplay =
    cleanText(match.contactName) || cleanText(match.name) || accountSubcontractorRaw;

  return companyName && companyName !== contactDisplay ? companyName : "";
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    let accounts: Record<string, unknown>[];
    let subs: Record<string, unknown>[];
    try {
      [accounts, subs] = await Promise.all([
        getOrFetch("accounts:getAllAccounts", () =>
          fetchAccountsForAction("getAllAccounts")
        ) as Promise<Record<string, unknown>[]>,
        getOrFetch("accounts-pdf-admin:subcontractors", fetchRawSubcontractors),
      ]);
    } catch (err) {
      if (err instanceof AccountsFetchError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }

    const account = findAccountByUrlId(accounts, id);
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Could not find this account." },
        { status: 404 }
      );
    }

    const accountName = cleanText(account.accountName) || "Unnamed Account";

    const address =
      cleanText(account.address) ||
      [account.city, account.state, account.zip].map(cleanText).filter(Boolean).join(", ");

    const startDate =
      cleanText(account.accountStartDate) ||
      cleanText(account.startDate) ||
      cleanText(account.serviceStartDate) ||
      "Not provided";

    const cleaningSchedule =
      cleanText(account.cleaningDays) ||
      cleanText(account.cleaningSchedule) ||
      cleanText(account.schedule) ||
      "Not provided";

    const teamLeaderName = cleanText(account.subcontractor) || "Unassigned";
    const monthlyPay = formatMoney(account.subcontractorPay ?? account.monthlySubcontractorPay);
    const hasKey = cleanText(account.hasKey);
    const alarmInfo = cleanText(account.alarmInfo) || cleanText(account.alarmCode);
    const scope = cleanText(account.scope) || cleanText(account.scopeOfWork);
    const manager = cleanText(account.manager);

    // Admin-only fields — same source/derivation as the account page's own
    // summary cards (app/accounts/[id]/page.tsx).
    const accountStatus = cleanText(account.status) || "No Status";
    const monthlyRevenue = formatMoney(account.monthlyRevenue);
    const monthlyRevenueNumber = moneyToNumber(account.monthlyRevenue);
    const subcontractorPayNumber = moneyToNumber(
      account.subcontractorPay ?? account.monthlySubcontractorPay
    );
    const computedGrossMargin = monthlyRevenueNumber - subcontractorPayNumber;
    const estGrossMargin = computedGrossMargin
      ? formatMoneyNumber(computedGrossMargin)
      : cleanText(account.grossMargin) || "N/A";
    const estGrossMarginPercent = cleanText(account.grossMarginPercent).replace(/%$/, "");
    const subcontractorCompany = findSubcontractorCompany(cleanText(account.subcontractor), subs);
    const notes = cleanText(account.notes);

    const generatedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const pdfBuffer = await renderAccountPacketAdminPdf({
      accountName,
      address,
      startDate,
      cleaningSchedule,
      teamLeaderName,
      monthlyPay,
      hasKey,
      alarmInfo,
      scope,
      manager,
      generatedDate,
      accountStatus,
      monthlyRevenue,
      estGrossMargin,
      estGrossMarginPercent,
      subcontractorCompany,
      notes,
    });

    const filenameDate = new Date().toISOString().slice(0, 10);
    const filename = `${slugifyFilenamePart(accountName)} - New Account Packet (Admin) - ${filenameDate}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[accounts/[id]/pdf/admin GET]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate the admin account packet PDF.",
      },
      { status: 500 }
    );
  }
}
