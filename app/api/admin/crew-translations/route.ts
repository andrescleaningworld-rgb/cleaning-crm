// Admin-only (proxy.ts default admin gate). "Review translations" on an
// account's Crew Link section: GET ?accountId= lists every text on that
// account's checklist tabs with its automatic and corrected ES/PT; POST
// { text, lang, value } saves a correction (empty value = back to the
// automatic one). Corrections are keyed by the English text, so they apply
// wherever that exact text appears. Postgres only.
import { NextRequest, NextResponse } from "next/server";
import { listAccountTranslationsForReview, setManualTranslation } from "@/lib/crewTranslations";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET(request: NextRequest) {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
    if (!accountId) return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
    const rows = await listAccountTranslationsForReview(accountId);
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    console.error("[crew-translations GET]", error);
    return NextResponse.json({ success: false, error: "Could not load translations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { text?: string; lang?: string; value?: string };
    const text = String(body.text ?? "");
    const lang = body.lang === "es" || body.lang === "pt" ? body.lang : null;
    if (!text.trim() || !lang) return NextResponse.json({ success: false, error: "text and lang (es/pt) are required." }, { status: 400 });
    const value = String(body.value ?? "");
    await setManualTranslation(text, lang, value);

    const actor = await getAdminIdentity(request);
    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "manager",
        actorName: actor.name || "",
        action: "update",
        entityType: "crew-translation",
        entityId: `${lang}:${text.slice(0, 80)}`,
        detail: value.trim() ? `Corrected ${lang.toUpperCase()}: "${text.slice(0, 80)}" → "${value.trim().slice(0, 80)}"` : `Removed ${lang.toUpperCase()} correction: "${text.slice(0, 80)}"`,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crew-translations POST]", error);
    return NextResponse.json({ success: false, error: "Could not save. Try again." }, { status: 500 });
  }
}
