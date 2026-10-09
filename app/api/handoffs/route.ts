// Handoffs API: what is waiting on whom (new accounts, account updates,
// supply orders) and Settings -> Team. Staff only (proxy.ts default gate).
// Postgres only; see lib/pg/handoffs.ts. When the tables are not in this
// database yet, GET answers { ready: false } and the screens hide the feature.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { fetchAllMainAccounts, fetchOnboardingChecklist } from "@/lib/data/accounts";
import {
  ACCOUNT_DONE_STEP,
  ORDER_STEPS,
  UPDATE_STEPS,
  currentOnboardingSection,
  onboardingRules,
  type HandoffKind,
  type HandoffSettings,
} from "@/lib/handoffs";
import { createEmptyChecklistItems } from "@/lib/onboardingChecklist";
import {
  getHandoff,
  getHandoffSettings,
  handoffMe,
  handoffsReady,
  listHandoffs,
  moveHandoff,
  patchHandoff,
  saveHandoffSettings,
  startHandoff,
} from "@/lib/pg/handoffs";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

function cleanData(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) out[key.slice(0, 40)] = clean(entry).slice(0, 2000);
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await handoffsReady())) return NextResponse.json({ success: true, ready: false });
    const identity = await getAdminIdentity(request);
    const [settings, items] = await Promise.all([getHandoffSettings(), listHandoffs()]);
    return NextResponse.json(
      {
        success: true,
        ready: true,
        settings: { ...settings, onboarding: onboardingRules(settings) },
        me: handoffMe(identity?.name ?? "", identity?.role, settings),
        items,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[handoffs GET]", error instanceof Error ? error.message : error);
    return refuse("The handoff list did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await handoffsReady())) return refuse("Handoffs are not set up in this database yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = identity.name ?? "";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    // A new account goes on the New accounts board: the day the estimate was
    // accepted, and (optionally) the estimate file already uploaded.
    if (action === "startAccount") {
      const accountId = clean(body.accountId);
      if (!accountId) return refuse("accountId is required.");
      const acceptedOn = /^\d{4}-\d{2}-\d{2}$/.test(clean(body.acceptedOn)) ? clean(body.acceptedOn) : new Date().toISOString().slice(0, 10);
      const checklist = await fetchOnboardingChecklist(accountId).catch(() => null);
      const step = currentOnboardingSection(checklist?.items ?? createEmptyChecklistItems());
      const data = { acceptedOn, estimateUrl: clean(body.estimateUrl), estimateName: clean(body.estimateName) };
      const existing = await getHandoff("account", accountId);
      if (existing) {
        // Already on the board: a later estimate (or a corrected date) replaces the old one.
        await patchHandoff("account", accountId, {
          manager: clean(body.manager) || undefined,
          accountName: clean(body.accountName) || undefined,
          data: { acceptedOn, ...(data.estimateUrl ? { estimateUrl: data.estimateUrl, estimateName: data.estimateName } : {}) },
        });
        return NextResponse.json({ success: true, item: await getHandoff("account", accountId) });
      }
      const item = await startHandoff({
        kind: "account",
        itemId: accountId,
        title: clean(body.accountName) || "New account",
        accountId,
        accountName: clean(body.accountName),
        manager: clean(body.manager),
        step,
        data,
        createdBy: by,
      });
      if (step === ACCOUNT_DONE_STEP) await moveHandoff({ kind: "account", itemId: accountId, toStep: ACCOUNT_DONE_STEP, by, done: true });
      return NextResponse.json({ success: true, item });
    }

    // One step forward on an account update or a supply order.
    if (action === "advance") {
      const kind = clean(body.kind) as HandoffKind;
      const itemId = clean(body.itemId);
      const toStep = clean(body.toStep);
      if ((kind !== "update" && kind !== "order") || !itemId) return refuse("kind and itemId are required.");
      const steps = kind === "order" ? ORDER_STEPS : UPDATE_STEPS;
      const toIndex = steps.findIndex((s) => s.key === toStep);
      if (toIndex < 1) return refuse("That is not a step this can move to.");

      let item = await getHandoff(kind, itemId);
      if (!item) {
        // Not tracked yet (an order placed before this feature, or one that
        // came in through Sheets): start it on the step the screen saw it on.
        const seed = (body.seed ?? {}) as Record<string, unknown>;
        const fromStep = steps.some((s) => s.key === clean(seed.step)) ? clean(seed.step) : steps[0].key;
        item = await startHandoff({
          kind,
          itemId,
          title: clean(seed.title) || (kind === "order" ? "Supply order" : "Account update"),
          accountId: clean(seed.accountId),
          accountName: clean(seed.accountName),
          manager: clean(seed.manager),
          step: fromStep,
          stepSince: clean(seed.stepSince),
          data: cleanData(seed.data),
          createdBy: clean(seed.createdBy),
        });
      }
      const fromIndex = steps.findIndex((s) => s.key === item.step);
      if (toIndex <= fromIndex) return NextResponse.json({ success: true, item });
      const moved = await moveHandoff({ kind, itemId, toStep, by, note: clean(body.note), done: toIndex === steps.length - 1 });
      return NextResponse.json({ success: true, item: moved });
    }

    // Supply orders live in their own list and their Status can still be
    // changed there, so the screens send what they see and this lines the
    // tracking up with it: starts tracking open orders that are not tracked
    // yet, and moves tracked ones whose Status was changed elsewhere.
    if (action === "syncOrders") {
      const seen = Array.isArray(body.orders) ? (body.orders as Record<string, unknown>[]).slice(0, 300) : [];
      let managers: Map<string, string> | null = null;
      const managerFor = async (accountId: string, accountName: string) => {
        if (!managers) {
          managers = new Map();
          try {
            for (const account of await fetchAllMainAccounts()) {
              if (account.accountId) managers.set(`id:${account.accountId.trim()}`, account.managerName ?? "");
              if (account.accountName) managers.set(`name:${account.accountName.trim().toLowerCase()}`, account.managerName ?? "");
            }
          } catch {
            // No account list: the order still tracks, with no manager (the owner covers it).
          }
        }
        return managers.get(`id:${accountId}`) ?? managers.get(`name:${accountName.toLowerCase()}`) ?? "";
      };
      let changed = 0;
      for (const order of seen) {
        const itemId = clean(order.itemId);
        const step = clean(order.step);
        if (!itemId) continue;
        const existing = await getHandoff("order", itemId);
        const lastIndex = ORDER_STEPS.length - 1;
        const index = ORDER_STEPS.findIndex((s) => s.key === step);
        if (!existing) {
          // Only orders still on their way are worth tracking from here.
          if (index < 0 || index === lastIndex) continue;
          await startHandoff({
            kind: "order",
            itemId,
            title: clean(order.title) || "Supply order",
            accountId: clean(order.accountId),
            accountName: clean(order.accountName),
            manager: await managerFor(clean(order.accountId), clean(order.accountName)),
            step,
            stepSince: clean(order.stepSince),
            data: cleanData(order.data),
            createdBy: clean(order.createdBy),
          });
          changed++;
        } else if (!existing.doneAt && existing.step !== step) {
          // Status changed with the old dropdown, or denied / cancelled ("" = out of the flow).
          await moveHandoff({ kind: "order", itemId, toStep: index >= 0 ? step : "closed", by, note: index >= 0 ? "" : "Order denied or cancelled", done: index < 0 || index === lastIndex });
          changed++;
        }
      }
      return NextResponse.json({ success: true, changed });
    }

    // Settings -> Team. The owner only, like the Managers list.
    if (action === "saveSettings") {
      if (identity.role !== "owner") return refuse("Only the owner can change the team settings.", 403);
      const input = (body.settings ?? {}) as Partial<HandoffSettings>;
      const settings = await saveHandoffSettings(
        {
          officeOwners: Array.isArray(input.officeOwners) ? input.officeOwners.map(clean) : [],
          redAfterDays: Number(input.redAfterDays) || 2,
          onboarding: onboardingRules({ officeOwners: [], redAfterDays: 2, onboarding: (input.onboarding ?? {}) as HandoffSettings["onboarding"] }),
        },
        by
      );
      return NextResponse.json({ success: true, settings: { ...settings, onboarding: onboardingRules(settings) } });
    }

    return refuse(`Unknown action "${action}".`);
  } catch (error) {
    console.error("[handoffs POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
