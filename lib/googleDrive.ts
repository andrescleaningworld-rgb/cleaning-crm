import { google } from "googleapis";
import { Readable } from "stream";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function getDriveClient() {
  return google.drive({
    version: "v3",
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    }),
  });
}

export function validatePhoto(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return "Only JPEG, PNG, WebP, or HEIC images are allowed.";
  if (file.size > MAX_BYTES) return "Photo must be under 10 MB.";
  return null;
}

export async function uploadPhotoToDrive(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  accountId: string
): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");

  const drive = getDriveClient();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `portal_${accountId}_${Date.now()}_${safeName}`;

  const { data } = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
  });

  const fileId = data.id;
  if (!fileId) throw new Error("Drive upload returned no file ID.");

  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return `https://drive.google.com/file/d/${fileId}/view`;
}
