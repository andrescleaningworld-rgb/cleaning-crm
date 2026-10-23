// Settings -> Reminders & check-ins (lib/pg/feature-settings.ts). Staff can
// read them; only the owner changes them.
//
// GET                       { ready, settings }
// POST { key, value }       saves one setting (owner only)

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { isFeatureSettingKey } from "@/lib/featureSettings";
import { featureSettingsReady, getFeatureSettings, saveFeatureSetting } from "@/lib/pg/feature-settings";
import { forgetRiskCache } from "@/lib/pg/account-risk";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    return NextResponse.json({ success: true, ready: await featureSettingsReady(), settings: await getFeatureSettings() }, noStore);
  } catch (error) {
    console.error("[feature-settings GET]", error instanceof Error ? error.message : error);
    return refuse("Settings did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    if (identity.role !== "owner") return refuse("Only the owner can change these.", 403);
    const body = (await request.json().catch(() => ({}))) as { key?: unknown; value?: unknown };
    if (!isFeatureSettingKey(body.key)) return refuse("Unknown setting.");
    const value = await saveFeatureSetting(body.key, body.value, identity.name || "Owner");
    // New thresholds count at once, not after the flags' 5-minute memory.
    if (body.key === "atRisk") forgetRiskCache();
    return NextResponse.json({ success: true, value }, noStore);
  } catch (error) {
    console.error("[feature-settings POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "That did not save.", 500);
  }
}
