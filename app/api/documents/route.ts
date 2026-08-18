import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import {
  appendDocument,
  deleteDocument,
  DOCUMENT_CATEGORIES,
  fetchDocuments,
  getDocumentById,
  type DocumentCategory,
} from "@/lib/googleSheets";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

export async function GET() {
  try {
    const documents = await fetchDocuments();
    const sorted = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

    return NextResponse.json({ success: true, documents: sorted });
  } catch (err) {
    console.error("[documents GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load documents." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { success: false, error: "Blob storage is not configured (missing BLOB_READ_WRITE_TOKEN)." },
      { status: 500 }
    );
  }

  try {
    // A body past the platform's own size ceiling (currently the same order
    // of magnitude as MAX_FILE_SIZE_BYTES) gets silently truncated before it
    // reaches here, which breaks multipart parsing with an opaque
    // "expected boundary after body" TypeError — catch that specifically so
    // the oversized-file case still surfaces our normal 400, not a raw 500.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: `File must be ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB or smaller.` },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    const name = String(formData.get("name") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const uploadedBy = String(formData.get("uploadedBy") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required." },
        { status: 400 }
      );
    }

    if (!isDocumentCategory(category)) {
      return NextResponse.json(
        { success: false, error: `Category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File must be 10MB or smaller." },
        { status: 400 }
      );
    }

    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const blobPath = `documents/${crypto.randomUUID()}${extension}`;

    const blob = await put(blobPath, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      // Already unique via the UUID above — a random suffix would just make
      // the URL longer for no benefit.
      addRandomSuffix: false,
    });

    const id = await appendDocument({
      name,
      category,
      fileName: file.name,
      fileUrl: blob.url,
      fileSize: file.size,
      uploadedBy,
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[documents POST]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to upload document." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing document id." },
        { status: 400 }
      );
    }

    const document = await getDocumentById(id);
    if (!document) {
      return NextResponse.json(
        { success: false, error: "Document not found." },
        { status: 404 }
      );
    }

    if (document.fileUrl) {
      // Best-effort: an already-missing blob shouldn't block removing the
      // sheet row (e.g. if a previous delete attempt partially succeeded).
      await del(document.fileUrl).catch((err) => {
        console.error("[documents DELETE] blob delete failed", err);
      });
    }

    await deleteDocument(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[documents DELETE]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to delete document." },
      { status: 500 }
    );
  }
}
