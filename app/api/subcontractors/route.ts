import { NextResponse } from "next/server";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

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

function getAccountAssignedSub(account: SheetRow) {
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

  const response = await fetch(`${SCRIPT_URL}?action=${action}`, {
    method: "GET",
    next: { revalidate: 300 }, // subs relatively static, 5 min cache
  });

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

    const subcontractorData = await fetchGoogleScriptData("getSubcontractors");
    const accountData = await fetchGoogleScriptData("getAccounts");

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
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

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