import { NextResponse } from "next/server";
import { getOrFetch } from "@/lib/serverCache";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export const maxDuration = 45;

type ActivityLogRow = {
  timestamp?: string;
  subcontractorEmail?: string;
  subcontractorName?: string;
  actionType?: string;
  details?: string;
};

type GoogleScriptResponse = {
  success?: boolean;
  error?: string;
  logs?: ActivityLogRow[];
  data?: ActivityLogRow[];
};

function getLoadedLogs(data: GoogleScriptResponse | ActivityLogRow[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.logs)) return data.logs;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

async function fetchActivityLog(): Promise<GoogleScriptResponse> {
  let response: Response;
  try {
    response = await fetchAppsScript(
      `${SCRIPT_URL}?action=getSubcontractorActivityLog`,
      { method: "GET", cache: "no-store" }
    );
  } catch (err) {
    if (err instanceof AppsScriptFetchError) throw new Error(err.message);
    throw err;
  }

  const text = await response.text();

  let data: GoogleScriptResponse;
  try {
    data = JSON.parse(text) as GoogleScriptResponse;
  } catch {
    throw new Error("Google Script did not return valid JSON while loading the activity log.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || "Failed to load activity log from Google Script.");
  }

  return data;
}

export async function GET() {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SCRIPT_URL in .env.local" },
        { status: 500 }
      );
    }

    const data = await getOrFetch("activity-log:getSubcontractorActivityLog", fetchActivityLog);

    return NextResponse.json(
      { success: true, logs: getLoadedLogs(data) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error loading activity log.",
      },
      { status: 500 }
    );
  }
}
