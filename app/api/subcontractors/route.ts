import { NextResponse } from "next/server";
import { getOrFetch, invalidateCached } from "@/lib/serverCache";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { updateSubcontractor } from "@/lib/googleSheets";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run.
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

function normalizeName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bllc\b/g, "")
    .replace(/\binc\b/g, "")
    .replace(/\bcorp\b/g, "")
    .replace(/\bcorporation\b/g, "")
    .replace(/\bcompany\b/g, "")
    .replace(/\bco\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getLoadedAccounts(data: GoogleScriptResponse | SheetRow[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.accounts)) return data.accounts;
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

function namesMatch(sub: SheetRow, account: SheetRow) {
  const accountAssignedSubRaw = getAccountAssignedSub(account);
  const accountAssignedSub = normalizeName(accountAssignedSubRaw);

  if (!accountAssignedSub) return false;

  const possibleSubNames = [
    getSubCompanyName(sub),
    getSubContactName(sub),
    getSubEmail(sub),
  ]
    .map((value) => normalizeName(value))
    .filter(Boolean);

  return possibleSubNames.some((subName) => {
    if (subName === accountAssignedSub) return true;

    if (subName.length >= 4 && accountAssignedSub.includes(subName)) {
      return true;
    }

    if (accountAssignedSub.length >= 4 && subName.includes(accountAssignedSub)) {
      return true;
    }

    return false;
  });
}

// Used by the accounts/complaints SMS notifications to resolve a free-text
// subcontractor name (the only linkage those routes have — see namesMatch's
// comment) to a phone number, via the same cached Apps Script subcontractor
// list and fuzzy company/contact-name matching namesMatch uses for an
// account row. Returns "" if there's no match or no phone on file.
export async function findSubcontractorPhoneByName(name: string): Promise<string> {
  const target = normalizeName(name);
  if (!target || !SCRIPT_URL) return "";

  let data: GoogleScriptResponse;
  try {
    data = await getOrFetch("subcontractors:getSubcontractors", () =>
      fetchGoogleScriptData("getSubcontractors")
    );
  } catch {
    return "";
  }

  const subcontractors = getLoadedSubcontractors(data);

  const match = subcontractors.find((sub) => {
    const possibleNames = [getSubCompanyName(sub), getSubContactName(sub)]
      .map((value) => normalizeName(value))
      .filter(Boolean);

    return possibleNames.some((subName) => {
      if (subName === target) return true;
      if (subName.length >= 4 && target.includes(subName)) return true;
      if (target.length >= 4 && subName.includes(target)) return true;
      return false;
    });
  });

  return match ? getSubPhone(match) : "";
}

// Same lookup as findSubcontractorPhoneByName above, for the complaint-
// notification email instead of SMS.
export async function findSubcontractorEmailByName(name: string): Promise<string> {
  const target = normalizeName(name);
  if (!target || !SCRIPT_URL) return "";

  let data: GoogleScriptResponse;
  try {
    data = await getOrFetch("subcontractors:getSubcontractors", () =>
      fetchGoogleScriptData("getSubcontractors")
    );
  } catch {
    return "";
  }

  const subcontractors = getLoadedSubcontractors(data);

  const match = subcontractors.find((sub) => {
    const possibleNames = [getSubCompanyName(sub), getSubContactName(sub)]
      .map((value) => normalizeName(value))
      .filter(Boolean);

    return possibleNames.some((subName) => {
      if (subName === target) return true;
      if (subName.length >= 4 && target.includes(subName)) return true;
      if (target.length >= 4 && subName.includes(target)) return true;
      return false;
    });
  });

  return match ? getSubEmail(match) : "";
}

function enrichSubcontractorsWithRevenue(
  subcontractors: SheetRow[],
  accounts: SheetRow[]
) {
  return subcontractors.map((sub) => {
    let accountsAssigned = 0;
    let subRevenue = 0;
    let cleaningWorldRevenue = 0;

    accounts.forEach((account) => {
      if (!isActiveAccount(account)) return;
      if (!namesMatch(sub, account)) return;

      accountsAssigned += 1;
      subRevenue += getAccountSubRevenue(account);
      cleaningWorldRevenue += getAccountMonthlyRevenue(account);
    });

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
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    // Cached 60s per action — this route's own upstream calls, plus the
    // "getAccounts" action /api/accounts also makes, were part of the load
    // that overwhelmed the shared Apps Script backend during the incident.
    // Run in parallel: sequential awaits let two independent ~18s-worst-case
    // calls add up past this route's 45s maxDuration, which is exactly what
    // was timing out /sub-schedules and /subcontractors in production.
    const [subcontractorData, accountData] = await Promise.all([
      getOrFetch("subcontractors:getSubcontractors", () =>
        fetchGoogleScriptData("getSubcontractors")
      ),
      getOrFetch("subcontractors:getAccounts", () =>
        fetchGoogleScriptData("getAccounts")
      ),
    ]);

    const subcontractors = getLoadedSubcontractors(subcontractorData);
    const accounts = getLoadedAccounts(accountData);

    const enrichedSubcontractors = enrichSubcontractorsWithRevenue(
      subcontractors,
      accounts
    );

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
        invalidateCached("subcontractors:getSubcontractors");
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