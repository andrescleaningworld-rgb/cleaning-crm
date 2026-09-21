import { NextResponse } from "next/server";
import { getOrFetch, invalidateCached } from "@/lib/serverCache";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import {
  updateSubcontractor,
  getSubcontractorPerformanceMap,
  buildSubcontractorPerformanceKey,
  getAllSubcontractorsRaw,
  getAllAccountsForSubEnrichment,
} from "@/lib/googleSheets";
import {
  resolveAssignedSubKey,
  resolveAssignedSubKeyWithCandidateCount,
  normalizeSubName,
} from "@/lib/subAccountMatching";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// GET below no longer calls Apps Script (migrated to direct Sheets API reads
// — see getAllSubcontractorsRaw/getAllAccountsForSubEnrichment in
// lib/googleSheets.ts), but POST's fallback path here still forwards
// unmigrated actions to it. Apps Script latency has been measured spiking to
// ~14s on a single call; this must comfortably exceed the per-attempt
// timeout in fetchAppsScript (18s) plus its one retry plus backoff, or
// Vercel would kill the function before our own retry/error-handling logic
// gets a chance to run.
export const maxDuration = 45;

type SheetRow = Record<string, string | number | boolean | null | undefined>;

type GoogleScriptResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: SheetRow[];
  accounts?: SheetRow[];
  data?: SheetRow[];
};

function rowValue(row: SheetRow, possibleKeys: string[]) {
  for (const key of possibleKeys) {
    const value = row[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function getMoneyValue(value: string) {
  const cleaned = String(value || "")
    .replace(/[$,]/g, "")
    .trim();

  const numberValue = Number(cleaned);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function formatMoney(value: number) {
  if (!value) return "";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getSubCompanyName(sub: SheetRow) {
  return rowValue(sub, [
    "companyName",
    "CompanyName",
    "Company Name",
    "company",
    "Company",
    "Subcontractor",
    "Sub Contractor",
    "Subcontractor Name",
    "Sub Contractor Name",
  ]);
}

function getSubContactName(sub: SheetRow) {
  return rowValue(sub, [
    "contactName",
    "ContactName",
    "Contact Name",
    "Name",
    "name",
  ]);
}

function getSubEmail(sub: SheetRow) {
  return rowValue(sub, [
    "email",
    "Email",
    "Email Address",
    "emailAddress",
  ]);
}

function getSubPhone(sub: SheetRow) {
  return rowValue(sub, [
    "phone",
    "Phone",
    "Phone Number",
    "phoneNumber",
    "Cell",
    "cell",
    "Mobile",
    "mobile",
  ]);
}

export function getAccountAssignedSub(account: SheetRow) {
  return rowValue(account, [
    "Subcontractor",
    "subcontractor",

    "subAssigned",
    "SubAssigned",
    "Sub Assigned",
    "sub assigned",

    "Sub Contractor",
    "subContractor",
    "SubContractor",

    "assignedSubcontractor",
    "AssignedSubcontractor",
    "Assigned Subcontractor",
    "Assigned Sub Contractor",

    "assignedTo",
    "AssignedTo",
    "Assigned To",

    "cleaningSub",
    "Cleaning Sub",
    "Cleaner",
    "cleaner",
  ]);
}

function getAccountStatus(account: SheetRow) {
  return rowValue(account, [
    "status",
    "Status",
    "Account Status",
  ]);
}

function isActiveAccount(account: SheetRow) {
  const status = getAccountStatus(account).toLowerCase().trim();

  if (!status) return true;

  return ![
    "cancelled",
    "canceled",
    "inactive",
    "lost",
    "terminated",
    "closed",
  ].includes(status);
}

function getAccountMonthlyRevenue(account: SheetRow) {
  return getMoneyValue(
    rowValue(account, [
      "Monthly Revenue",
      "monthlyRevenue",
      "MonthlyRevenue",

      "monthlyPrice",
      "MonthlyPrice",
      "Monthly Price",

      "Monthly Billing",
      "monthlyBilling",

      "Customer Monthly Price",
      "customerMonthlyPrice",

      "Customer Price",
      "customerPrice",

      "Price",
      "price",
      "Amount",
      "amount",
    ])
  );
}

function getAccountSubRevenue(account: SheetRow) {
  return getMoneyValue(
    rowValue(account, [
      "Monthly Subcontractor Pay",
      "monthlySubcontractorPay",
      "MonthlySubcontractorPay",

      "monthlySubPay",
      "MonthlySubPay",
      "Monthly Sub Pay",

      "subPay",
      "SubPay",
      "Sub Pay",

      "subcontractorPay",
      "SubcontractorPay",
      "Subcontractor Pay",

      "subMonthlyPrice",
      "SubMonthlyPrice",
      "Sub Monthly Price",

      "Monthly Subcontractor Price",
      "monthlySubcontractorPrice",

      "Sub Price",
      "subPrice",

      "Sub Amount",
      "subAmount",
    ])
  );
}

function getLoadedSubcontractors(data: GoogleScriptResponse | SheetRow[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.subcontractors)) return data.subcontractors;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

async function fetchGoogleScriptData(action: string) {
  if (!SCRIPT_URL) {
    throw new Error("Missing GOOGLE_SCRIPT_URL in .env.local");
  }

  let response: Response;
  try {
    response = await fetchAppsScript(`${SCRIPT_URL}?action=${action}`, {
      method: "GET",
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof AppsScriptFetchError) throw new Error(err.message);
    throw err;
  }

  const text = await response.text();

  let data: GoogleScriptResponse;

  try {
    data = JSON.parse(text) as GoogleScriptResponse;
  } catch {
    throw new Error(
      `Google Script did not return valid JSON while loading ${action}.`
    );
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.error || `Failed to load ${action} from Google Script.`
    );
  }

  return data;
}

// Shared resolution behind findSubcontractorPhoneByName/EmailByName below —
// same cached Apps Script subcontractor list those two always used, now
// resolved with the same ambiguity-safe resolveAssignedSubKey the
// Accounts-tab join uses (lib/subAccountMatching.ts) instead of each
// function's own fuzzy-substring loop, so a name like "Cesar" or "Giovanna"
// that plausibly refers to more than one subcontractor no longer silently
// picks whichever one Array.find() hit first. An unresolved or ambiguous
// name logs one line (name + candidate count, never a phone/email) and
// returns null — the caller already treats a null match as "no phone/email
// on file" and skips the notification without failing the account or
// complaint save that triggered the lookup.
async function resolveSubcontractorByName(
  name: string,
  callerLabel: string
): Promise<SheetRow | null> {
  const trimmedName = name.trim();
  if (!trimmedName || !SCRIPT_URL) return null;

  let data: GoogleScriptResponse;
  try {
    data = await getOrFetch("subcontractors:getSubcontractors", () =>
      fetchGoogleScriptData("getSubcontractors")
    );
  } catch {
    return null;
  }

  const subcontractors = getLoadedSubcontractors(data);

  const subEntries = subcontractors.map((sub, index) => ({
    key: String(index),
    company: normalizeSubName(getSubCompanyName(sub)),
    contact: normalizeSubName(getSubContactName(sub)),
  }));

  const { key, candidateCount } = resolveAssignedSubKeyWithCandidateCount(trimmedName, subEntries);

  if (!key) {
    console.warn(
      `[subcontractors] ${callerLabel}: unresolved name "${trimmedName}" (${candidateCount} candidate subcontractor(s)) — no notification sent.`
    );
    return null;
  }

  return subcontractors[Number(key)] ?? null;
}

// Used by the accounts/complaints SMS notifications to resolve a free-text
// subcontractor name (the only linkage those routes have) to a phone number.
// Returns "" if there's no unambiguous match or no phone on file.
export async function findSubcontractorPhoneByName(name: string): Promise<string> {
  const match = await resolveSubcontractorByName(name, "findSubcontractorPhoneByName");
  return match ? getSubPhone(match) : "";
}

// Same lookup as findSubcontractorPhoneByName above, for the complaint-
// notification email instead of SMS.
export async function findSubcontractorEmailByName(name: string): Promise<string> {
  const match = await resolveSubcontractorByName(name, "findSubcontractorEmailByName");
  return match ? getSubEmail(match) : "";
}

// One pass over accounts, resolving each active account's raw Subcontractor
// value to at most one subcontractor (same ambiguity-safe resolveAssignedSubKey
// the Accounts-tab join uses elsewhere — see lib/subAccountMatching.ts),
// instead of the old per-(sub, account) pair namesMatch loop. That loop
// tested each subcontractor against every account in isolation, so an
// account whose raw field fuzzy-matched more than one subcontractor (e.g.
// "Cesar" substring-matching both "Cesar" and "Cesar Decarvalho") was
// counted — with its full revenue — onto every one of them; this resolves
// each account to at most one key first, so it can only ever land on one
// subcontractor's tally, never double-counted or duplicated onto an
// unrelated one. Company/contact are the only signals used (unlike the old
// namesMatch, which also matched on email) — see resolveAssignedSubKey's
// contract: its subEntries.company/contact must already be normalized via
// normalizeSubName, which this does before calling it.
function enrichSubcontractorsWithRevenue(
  subcontractors: SheetRow[],
  accounts: SheetRow[]
) {
  const subEntries = subcontractors.map((sub, index) => ({
    key: String(index),
    company: normalizeSubName(getSubCompanyName(sub)),
    contact: normalizeSubName(getSubContactName(sub)),
  }));

  type SubStats = { accountsAssigned: number; subRevenue: number; cleaningWorldRevenue: number };
  const statsByKey = new Map<string, SubStats>();
  const resolveCache = new Map<string, string>();

  for (const account of accounts) {
    if (!isActiveAccount(account)) continue;

    const raw = getAccountAssignedSub(account);
    if (!raw) continue;

    let key = resolveCache.get(raw);
    if (key === undefined) {
      key = resolveAssignedSubKey(raw, subEntries);
      resolveCache.set(raw, key);
    }
    if (!key) continue;

    if (!statsByKey.has(key)) {
      statsByKey.set(key, { accountsAssigned: 0, subRevenue: 0, cleaningWorldRevenue: 0 });
    }
    const stats = statsByKey.get(key)!;
    stats.accountsAssigned += 1;
    stats.subRevenue += getAccountSubRevenue(account);
    stats.cleaningWorldRevenue += getAccountMonthlyRevenue(account);
  }

  return subcontractors.map((sub, index) => {
    const { accountsAssigned, subRevenue, cleaningWorldRevenue }: SubStats =
      statsByKey.get(String(index)) ?? { accountsAssigned: 0, subRevenue: 0, cleaningWorldRevenue: 0 };

    return {
      ...sub,

      accountsAssigned: String(accountsAssigned),
      AccountsAssigned: String(accountsAssigned),
      "Accounts Assigned": String(accountsAssigned),

      subRevenue: formatMoney(subRevenue),
      SubRevenue: formatMoney(subRevenue),
      "Sub Revenue": formatMoney(subRevenue),
      monthlySubRevenue: formatMoney(subRevenue),
      MonthlySubRevenue: formatMoney(subRevenue),
      "Monthly Sub Revenue": formatMoney(subRevenue),

      cleaningWorldRevenue: formatMoney(cleaningWorldRevenue),
      CleaningWorldRevenue: formatMoney(cleaningWorldRevenue),
      "Cleaning World Revenue": formatMoney(cleaningWorldRevenue),
      monthlyRevenue: formatMoney(cleaningWorldRevenue),
      MonthlyRevenue: formatMoney(cleaningWorldRevenue),
      "Monthly Revenue": formatMoney(cleaningWorldRevenue),
    };
  });
}

export async function GET() {
  try {
    // Migrated off Apps Script's "getSubcontractors"/"getAccounts" actions:
    // this route already discarded the score/scoreStatus/complaints/
    // avgCondition fields Apps Script computed in favor of
    // getSubcontractorPerformanceMap below, so the only thing still coming
    // from Apps Script was raw contact/profile fields and the account-side
    // assignment/revenue fields enrichSubcontractorsWithRevenue joins
    // against — both now read directly via the Sheets API (see
    // getAllSubcontractorsRaw/getAllAccountsForSubEnrichment in
    // lib/googleSheets.ts). Run in parallel with performanceMap, which was
    // already a direct-Sheets-API read fetched uncached alongside these —
    // see getSubcontractorPerformanceMap's comment in lib/googleSheets.ts.
    const [subcontractors, accounts, performanceMap] = await Promise.all([
      getAllSubcontractorsRaw(),
      getAllAccountsForSubEnrichment(),
      getSubcontractorPerformanceMap(),
    ]);

    const enrichedSubcontractors = enrichSubcontractorsWithRevenue(
      subcontractors,
      accounts
    ).map((sub) => {
      // Not sub's own id field — see buildSubcontractorPerformanceKey's
      // comment in lib/googleSheets.ts for why that field is unreliable.
      const key = buildSubcontractorPerformanceKey(
        rowValue(sub, ["companyName", "Company Name"]),
        rowValue(sub, ["contactName", "Contact Name"])
      );
      const perf = performanceMap.get(key);
      if (!perf) return sub;

      const avgConditionText = perf.avgCondition !== null ? String(perf.avgCondition) : "";

      return {
        ...sub,
        score: String(perf.score),
        Score: String(perf.score),
        scoreStatus: perf.scoreStatus,
        ScoreStatus: perf.scoreStatus,
        "Score Status": perf.scoreStatus,
        complaints: String(perf.openComplaints),
        Complaints: String(perf.openComplaints),
        avgCondition: avgConditionText,
        AvgCondition: avgConditionText,
        "Avg Condition": avgConditionText,
        lastReview: perf.lastReview,
        LastReview: perf.lastReview,
        "Last Review": perf.lastReview,
      };
    });

    return NextResponse.json(
      {
        success: true,
        subcontractors: enrichedSubcontractors,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading subcontractors.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Migrated off the Apps Script backend: that path wrote a full row
    // (including column A, the Subcontractor ID) back to the sheet, which
    // collided with the ARRAYFORMULA in A2 that spills computed IDs down
    // the whole column and corrupted it on every edit. This writes directly
    // via the Sheets API, targeting only the specific changed columns from
    // B onward — see updateSubcontractor in lib/googleSheets.ts.
    if (body.action === "updateSubcontractor") {
      const { id, ...fields } = body as { id?: unknown; [key: string]: unknown };

      if (typeof id !== "string" || !id.trim()) {
        return NextResponse.json(
          { success: false, error: "Missing subcontractor id." },
          { status: 400 }
        );
      }

      try {
        const subcontractor = await updateSubcontractor(id, fields);
        await invalidateCached("subcontractors:getSubcontractors");
        return NextResponse.json({ success: true, subcontractor });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to update subcontractor.",
          },
          { status: 500 }
        );
      }
    }

    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();

    let data: GoogleScriptResponse;

    try {
      data = JSON.parse(text) as GoogleScriptResponse;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            body.action === "updateSubcontractor"
              ? "Google Script did not return valid JSON while updating subcontractor."
              : "Google Script did not return valid JSON while saving subcontractor.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Google Script failed.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error saving subcontractor.",
      },
      { status: 500 }
    );
  }
}