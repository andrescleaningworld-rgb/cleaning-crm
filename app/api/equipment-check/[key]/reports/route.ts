// Public route — signed-in tablet session required. One report = one
// equipment_reports row (docs/equipment-check-spec.md §5). Multipart body:
// equipmentId, condition (good/damaged/lost), notes, photos[].
//   good    -> no notes, no photos, no email
//   damaged -> 1-3 photos required, optional notes, email
//   lost    -> 0-3 photos, optional notes, email
// Never writes to Sheets; the Equipment item itself is only read.
// Vehicles (id "vehicle:<n>", Postgres) are reported the same way — the row's
// equipment_id is that "vehicle:<n>" id.
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import { getEquipmentById } from "@/lib/googleSheets";
import {
  createEquipmentReport,
  setEquipmentReportPhotos,
  setEquipmentReportTranslation,
  EQUIPMENT_CONDITIONS,
  type EquipmentCondition,
} from "@/lib/equipmentCheckDb";
import { requireEquipmentCheckSession } from "@/lib/equipmentCheckSession";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { sendInternalNotification, type EmailAttachment } from "@/lib/email";
import { translateToEnglish } from "@/lib/translate";
import { TEAM_HUB_TIMEZONE } from "@/lib/teamHubTimezone";
import { getVehicle } from "@/lib/vehiclesDb";
import { vehicleIdFromTabletId } from "@/lib/vehicleInput";

type ReportedThing = { id: string; name: string; serialNumber: string; adminPath: string };

// An Equipment tab item, or a vehicle; null if missing or retired.
async function findReportedThing(equipmentId: string): Promise<ReportedThing | null> {
  const vehicleId = vehicleIdFromTabletId(equipmentId);
  if (vehicleId !== null) {
    const vehicle = await getVehicle(vehicleId);
    if (!vehicle || !vehicle.active) return null;
    return { id: equipmentId, name: vehicle.name, serialNumber: vehicle.plate, adminPath: `/equipment/vehicles/${vehicle.id}` };
  }
  const item = equipmentId ? await getEquipmentById(equipmentId) : null;
  if (!item || item.status === "Retired") return null;
  return { id: item.id, name: item.name, serialNumber: item.serialNumber, adminPath: `/equipment/${encodeURIComponent(item.id)}` };
}

const MAX_NOTE_LENGTH = 2000;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);

const CONDITION_EMAIL_LABEL: Record<EquipmentCondition, string> = {
  good: "Good",
  damaged: "Damaged or not working",
  lost: "Lost",
};

function photoExtension(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/heic" || type === "image/heif") return "heic";
  return "jpg";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const allowed = await checkRateLimit(`equipment-check-report:${key}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const formData = await request.formData();
    const equipmentId = String(formData.get("equipmentId") ?? "").trim();
    const condition = String(formData.get("condition") ?? "").trim().toLowerCase() as EquipmentCondition;
    if (!EQUIPMENT_CONDITIONS.includes(condition)) {
      return NextResponse.json({ success: false, error: "Invalid condition." }, { status: 400 });
    }

    const equipment = await findReportedThing(equipmentId);
    if (!equipment) {
      return NextResponse.json({ success: false, error: "Equipment not found." }, { status: 404 });
    }

    // Green is one tap: anything else sent along with it is ignored.
    const notes = condition === "good" ? "" : String(formData.get("notes") ?? "").trim().slice(0, MAX_NOTE_LENGTH);
    const files = condition === "good" ? [] : formData.getAll("photos").filter((f): f is File => f instanceof File);

    if (files.length > MAX_PHOTOS) {
      return NextResponse.json({ success: false, error: `Up to ${MAX_PHOTOS} photos allowed.` }, { status: 400 });
    }
    if (condition === "damaged" && files.length === 0) {
      return NextResponse.json({ success: false, error: "A photo is required." }, { status: 400 });
    }
    for (const file of files) {
      if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
        return NextResponse.json({ success: false, error: `Unsupported photo format: ${file.type || "unknown"}.` }, { status: 400 });
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ success: false, error: "Each photo must be 8MB or smaller." }, { status: 400 });
      }
    }
    if (files.length > 0 && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ success: false, error: "Photo storage is not configured." }, { status: 500 });
    }

    const report = await createEquipmentReport({
      staffId: ctx.staff.id,
      equipmentId: equipment.id,
      condition,
      notesOriginal: notes || null,
    });

    const photoUrls: string[] = [];
    const attachments: EmailAttachment[] = [];
    for (const [index, file] of files.entries()) {
      const extension = photoExtension(file.type);
      try {
        const blob = await put(`equipment-reports/${report.id}/${crypto.randomUUID()}.${extension}`, file, {
          access: "public",
          contentType: file.type,
          addRandomSuffix: false,
        });
        photoUrls.push(blob.url);
        attachments.push({
          filename: `photo-${index + 1}.${extension}`,
          content: Buffer.from(await file.arrayBuffer()),
          contentType: file.type,
        });
      } catch (uploadError) {
        // Same as Team Hub issues: one failed upload shouldn't lose the report.
        console.error("[equipment-check reports POST] photo upload failed:", uploadError);
      }
    }
    if (photoUrls.length > 0) await setEquipmentReportPhotos(report.id, photoUrls);

    const origin = new URL(request.url).origin;
    const staffName = ctx.staff.name;

    // Translation first, then the email (so the email carries the English
    // text), both inside one waitUntil so the tablet's "Done!" isn't held
    // up — same order as app/api/team-hub/[token]/issues/route.ts.
    if (condition !== "good") {
      waitUntil(
        (async () => {
          let englishNotes = notes;
          if (notes) {
            const translated = await translateToEnglish(notes);
            if (translated) {
              await setEquipmentReportTranslation(report.id, translated.english, translated.detectedLanguage);
              englishNotes = translated.english;
            }
          }
          const when = new Date(report.createdAt).toLocaleString("en-US", { timeZone: TEAM_HUB_TIMEZONE });
          const tag = equipment.serialNumber ? ` (tag ${equipment.serialNumber})` : "";
          await sendInternalNotification(
            `Equipment Check: ${equipment.name}${tag} — ${CONDITION_EMAIL_LABEL[condition]}`,
            [
              `Equipment: ${equipment.name}${tag}`,
              `Condition: ${CONDITION_EMAIL_LABEL[condition]}`,
              `Reported by: ${staffName}`,
              `When: ${when}`,
              notes ? `Notes: ${englishNotes}` : "No notes.",
              ...(notes && englishNotes !== notes ? [`Original: ${notes}`] : []),
              photoUrls.length > 0 ? `Photos attached (${photoUrls.length}): ${photoUrls.join(", ")}` : "No photos.",
              `Equipment item: ${origin}${equipment.adminPath}`,
              "",
              "Last report only — not proof of who caused it. Someone may have used it after without reporting. Check before acting.",
            ],
            attachments
          );
        })().catch((error) => console.error("[equipment-check report email]", error))
      );
    }

    return NextResponse.json({ success: true, reportId: report.id, photosUploaded: photoUrls.length });
  } catch (error) {
    console.error("[equipment-check reports POST]", error);
    return NextResponse.json({ success: false, error: "Something went wrong sending this report." }, { status: 500 });
  }
}
