import { NextRequest, NextResponse } from "next/server";
import {
  appendDocumentSend,
  fetchDocumentSends,
  getDocumentById,
  getAllSubcontractorsRaw,
} from "@/lib/googleSheets";
import { sendSubcontractorNotification } from "@/lib/email";

// Matches the Phase 1 upload cap (app/api/documents/route.ts) — a document
// can never exceed this, so this is purely a defensive re-check, not a
// separate limit to keep in sync.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export async function GET(request: NextRequest) {
  try {
    const documentId = request.nextUrl.searchParams.get("documentId")?.trim() || undefined;
    const sends = await fetchDocumentSends(documentId);
    return NextResponse.json({ success: true, sends });
  } catch (err) {
    console.error("[documents/send GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load send history." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      documentId?: string;
      subcontractorId?: string;
      note?: string;
      sentBy?: string;
    };

    const documentId = body.documentId?.trim();
    const subcontractorId = body.subcontractorId?.trim();
    const note = body.note?.trim() ?? "";
    const sentBy = body.sentBy?.trim() ?? "";

    if (!documentId) {
      return NextResponse.json({ success: false, error: "Missing document id." }, { status: 400 });
    }
    if (!subcontractorId) {
      return NextResponse.json({ success: false, error: "Missing subcontractor id." }, { status: 400 });
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ success: false, error: "Document not found." }, { status: 404 });
    }

    // Reuses the same subcontractor source as the rest of the app (GET
    // /api/subcontractors, the Sub Center, accounts/new's picker) — no new
    // data source. "id" here is the row-position id ("SUB-ROW-<n>") that
    // getAllSubcontractorsRaw already normalizes, same as updateSubcontractor.
    const subcontractors = await getAllSubcontractorsRaw();
    const subcontractor = subcontractors.find((s) => s.id === subcontractorId);
    if (!subcontractor) {
      return NextResponse.json({ success: false, error: "Subcontractor not found." }, { status: 404 });
    }

    const email = subcontractor.email?.trim();
    if (!email) {
      const label = subcontractor.companyName || subcontractor.contactName || "This subcontractor";
      return NextResponse.json(
        { success: false, error: `${label} has no email on file.` },
        { status: 400 }
      );
    }

    let fileBuffer: Buffer;
    let fileContentType: string | undefined;
    try {
      const fileResponse = await fetch(document.fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`File fetch returned ${fileResponse.status}.`);
      }
      fileContentType = fileResponse.headers.get("content-type") ?? undefined;
      fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    } catch (err) {
      console.error("[documents/send] file fetch failed", err);
      return NextResponse.json(
        { success: false, error: "Could not fetch the document file to attach." },
        { status: 502 }
      );
    }

    if (fileBuffer.length > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { success: false, error: "Document file is too large to email as an attachment." },
        { status: 400 }
      );
    }

    const subject = `Document from Cleaning World: ${document.name}`;
    const lines = [
      `Category: ${document.category}`,
      ...(note ? [`Note: ${note}`] : []),
      "",
      "Please see the attached file.",
      "",
      "— Cleaning World",
    ];

    let sent: boolean;
    try {
      sent = await sendSubcontractorNotification(email, subject, lines, [
        {
          filename: document.fileName || document.name,
          content: fileBuffer,
          contentType: fileContentType,
        },
      ]);
    } catch (err) {
      console.error("[documents/send] email send failed", err);
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Failed to send email." },
        { status: 502 }
      );
    }

    if (!sent) {
      return NextResponse.json(
        { success: false, error: "Email is not configured (missing provider credentials)." },
        { status: 500 }
      );
    }

    // Best-effort: the email already went out, so a logging failure
    // shouldn't turn this into a reported failure (and risk a duplicate
    // resend).
    try {
      await appendDocumentSend({
        documentId: document.id,
        documentName: document.name,
        subcontractorId: subcontractor.id,
        subcontractorName:
          subcontractor.companyName || subcontractor.contactName || email,
        sentBy,
        note,
      });
    } catch (err) {
      console.error("[documents/send] logging send failed", err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[documents/send POST]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to send document." },
      { status: 500 }
    );
  }
}
