import { NextRequest, NextResponse } from "next/server";
import {
  fetchOnboardingChecklist,
  markOnboardingAutoStableApplied,
  setOnboardingChecklistItem,
} from "@/lib/googleSheets";
import { createEmptyChecklistItems, isChecklistComplete } from "@/lib/onboardingChecklist";

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

      // True exactly once — the moment every item first becomes checked and
      // the completion side effect (Account Health -> Stable) hasn't run
      // yet. The client is responsible for applying that side effect (via
      // the existing updateAccountFields/addAccountUpdate path) and then
      // calling markAutoStableApplied below so this never re-fires.
      const justCompleted = isChecklistComplete(checklist.items) && !checklist.autoStableAppliedAt;

      return NextResponse.json({ success: true, checklist, justCompleted });
    }

    if (action === "markAutoStableApplied") {
      const accountId = String(body.accountId ?? "").trim();
      if (!accountId) {
        return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
      }
      await markOnboardingAutoStableApplied(accountId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save onboarding checklist." },
      { status: 500 }
    );
  }
}
