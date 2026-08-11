import { NextRequest, NextResponse } from "next/server";
import {
  fetchOnboardingChecklist,
  markOnboardingAutoStableApplied,
  setOnboardingChecklistItem,
} from "@/lib/googleSheets";
import { createEmptyChecklistItems, isChecklistComplete } from "@/lib/onboardingChecklist";
import { syncOnboardingFieldWrite } from "@/lib/onboardingFieldSync";

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

      const accountName = String(body.accountName ?? "");
      const checked = Boolean(body.checked);
      const note = String(body.note ?? "");

      let checklist = await setOnboardingChecklistItem({ accountId, accountName, itemKey, checked, note });

      // Best-effort, silent field sync — never lets a field-write failure
      // fail the checklist save itself (the item is already saved above by
      // the time this runs), and never triggers account-updates/an email:
      // see syncOnboardingFieldWrite's comment for why per-save history
      // logging was removed. Only items in ONBOARDING_FIELD_WRITES /
      // ONBOARDING_COMBINED_FIELD do anything here; every other item is a
      // no-op.
      try {
        const sync = await syncOnboardingFieldWrite({
          accountId,
          itemKey,
          items: checklist.items,
          requestOrigin: new URL(request.url).origin,
          cookieHeader: request.headers.get("cookie") ?? "",
        });
        if (sync.overwriteNote) {
          checklist = await setOnboardingChecklistItem({
            accountId,
            accountName,
            itemKey,
            checked,
            note,
            fieldOverwriteNote: sync.overwriteNote,
          });
        }
      } catch (err) {
        console.error(
          "[onboarding-checklist] field sync failed:",
          err instanceof Error ? err.message : err
        );
      }

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
