// Photos -> "Import photos" for one account (app/photos/import-photos.tsx;
// lib/pg/crew-photos.ts addImportedPhoto). Staff only: proxy.ts default
// gate, and the staff session is checked here too.
//
// POST JSON { action: "check", accountId, hashes: [...] }   -> { already: [...] }  (which ones to skip)
// POST multipart { accountId, accountName, hash, takenAt, full, thumb? }
//   200 { success, id, already }   saved (or this account already had it)
//   400 { success: false, error }  this photo cannot be imported (the reason)

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { addImportedPhoto, crewPhotosReady, CrewPhotoError, importedAlready } from "@/lib/pg/crew-photos";

export const maxDuration = 60;

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const clean = (value: unknown) => String(value ?? "").trim();

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Staff only.", 401);
    if (!(await crewPhotosReady())) return refuse("Crew photos are not turned on here yet.", 409);

    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as { action?: unknown; accountId?: unknown; hashes?: unknown };
      const accountId = clean(body.accountId);
      if (body.action !== "check" || !accountId) return refuse("Unknown action.");
      const hashes = Array.isArray(body.hashes) ? body.hashes.map(clean).slice(0, 2000) : [];
      return NextResponse.json({ success: true, already: [...(await importedAlready(accountId, hashes))] });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return refuse("No photo.");
    const accountId = clean(form.get("accountId"));
    const full = form.get("full");
    const thumb = form.get("thumb");
    if (!accountId) return refuse("Which account?");
    if (!(full instanceof File)) return refuse("No photo.");
    const saved = await addImportedPhoto({
      accountId,
      accountName: clean(form.get("accountName")),
      hash: clean(form.get("hash")),
      takenAt: clean(form.get("takenAt")),
      full,
      thumb: thumb instanceof File ? thumb : null,
      by: clean(identity.name) || "Staff",
    });
    return NextResponse.json({ success: true, ...saved });
  } catch (error) {
    if (error instanceof CrewPhotoError) return refuse(error.message);
    console.error("[photo-index import POST]", error instanceof Error ? error.message : error);
    return refuse("The photo did not save. Try again.", 500);
  }
}
