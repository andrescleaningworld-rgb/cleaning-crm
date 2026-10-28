// The checklist's own ticks and notes (lib/onboardingChecklist.ts): the setup
// wizard's Yes taps for an account with no new-account steps, and the
// "Special equipment?" note. Everything else the wizard asks is saved on the
// account itself (app/api/setup-wizard).
//
// GET  ?accountId=X                                        the checklist
// POST { action: "setItem", accountId, itemKey, checked, note }

import { NextRequest, NextResponse } from "next/server";
import { fetchOnboardingChecklist, setOnboardingChecklistItem } from "@/lib/data/accounts";
import { createEmptyChecklistItems } from "@/lib/onboardingChecklist";

export async function GET(request: NextRequest) {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
    if (!accountId) {
      return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
    }

    const checklist = await fetchOnboardingChecklist(accountId);

    return NextResponse.json({
      success: true,
      checklist:
        checklist ?? {
          accountId,
          accountName: "",
          items: createEmptyChecklistItems(),
          startedAt: "",
          lastUpdatedAt: "",
          completedAt: "",
          autoStableAppliedAt: "",
        },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load onboarding checklist." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = typeof body.action === "string" && body.action ? body.action : "setItem";

    if (action === "setItem") {
      const accountId = String(body.accountId ?? "").trim();
      const itemKey = String(body.itemKey ?? "").trim();

      if (!accountId || !itemKey) {
        return NextResponse.json(
          { success: false, error: "accountId and itemKey are required." },
          { status: 400 }
        );
      }

      const checklist = await setOnboardingChecklistItem({
        accountId,
        accountName: String(body.accountName ?? ""),
        itemKey,
        checked: Boolean(body.checked),
        note: String(body.note ?? ""),
      });

      return NextResponse.json({ success: true, checklist });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save onboarding checklist." },
      { status: 500 }
    );
  }
}
