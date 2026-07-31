import { NextRequest, NextResponse } from "next/server";
import { getOrFetch } from "@/lib/serverCache";
import { fetchAccountsForAction, AccountsFetchError } from "@/app/api/accounts/route";
import { renderAccountPacketPdf } from "@/lib/pdf/account-packet";

// Admin-only: this path isn't listed in proxy.ts's PUBLIC_PATHS, SUB_PATHS,
// or SUB_OR_ADMIN_PATHS, so it falls through to proxy.ts's default branch,
// which requires a valid admin session — the same pattern every other
// admin-only route in this app relies on (e.g. app/api/admin/managers,
// app/api/accounts itself). No auth code needed here.

// Same margin as app/api/accounts/route.ts's GET/POST handlers: Apps Script
// latency has been observed spiking to ~14s, so this needs enough headroom
// for that fetch plus PDF rendering.
export const maxDuration = 45;

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

// Filenames can't safely contain the characters Content-Disposition (or
// most filesystems) choke on — strip down to something universally safe
// rather than trying to allowlist every legal-but-awkward character.
function slugifyFilenamePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim();
}

// Mirrors app/accounts/[id]/page.tsx's foundAccount matcher — the client
// constructs its links from accountId||id||rowNumber||accountName, so this
// needs to match against the exact same set of candidate fields.
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

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    let accounts: Record<string, unknown>[];
    try {
      accounts = (await getOrFetch("accounts:getAllAccounts", () =>
        fetchAccountsForAction("getAllAccounts")
      )) as Record<string, unknown>[];
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

    // Raw account field, not the UI's subcontractor-directory cross-reference
    // (app/accounts/[id]/page.tsx's subcontractorContactDisplay) — that
    // lookup depends on a second /api/subcontractors fetch purely to prefer
    // a contact name over the company name; the account's own stored value
    // is what actually belongs to this account record.
    const teamLeaderName = cleanText(account.subcontractor) || "Unassigned";

    const monthlyPay = formatMoney(account.subcontractorPay ?? account.monthlySubcontractorPay);

    const hasKey = cleanText(account.hasKey);
    const alarmInfo = cleanText(account.alarmInfo) || cleanText(account.alarmCode);
    const scope = cleanText(account.scope) || cleanText(account.scopeOfWork);
    const manager = cleanText(account.manager);

    const generatedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const pdfBuffer = await renderAccountPacketPdf({
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
    });

    const filenameDate = new Date().toISOString().slice(0, 10);
    const filename = `${slugifyFilenamePart(accountName)} - New Account Packet - ${filenameDate}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[accounts/[id]/pdf GET]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate the account packet PDF.",
      },
      { status: 500 }
    );
  }
}
