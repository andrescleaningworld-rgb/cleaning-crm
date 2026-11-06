// Account documents (lib/pg/account-documents.ts). Staff only: behind the
// staff login in proxy.ts, and the staff session is checked here too.
//   GET ?accountId=…    { ready, documents } newest first
//   GET ?counts=1       { counts: { accountId: n } } (Accounts center's 📎)
//   POST { action: "add", accountId, accountName, docType, note, files: [{ url, name, size, contentType }] }
//        the files were uploaded first (POST /api/account-documents/upload)
//   POST { action: "update", id, name?, docType?, note?, shareWithSub? }
//   POST { action: "delete", id }  (the file is removed from storage too,
//        unless the app filed it from another record, like an estimate)

import { NextRequest, NextResponse } from "next/server";
import { del, privateFilesOn, storedPathname, toStoredUrl } from "@/lib/files";
import { getAdminIdentity } from "@/lib/adminSession";
import { DOC_EXTENSIONS, DOC_FOLDER, isDocType } from "@/lib/accountDocuments";
import {
  addAccountDocument,
  deleteAccountDocument,
  documentCounts,
  documentsReady,
  listAccountDocuments,
  updateAccountDocument,
  type NewDocument,
} from "@/lib/pg/account-documents";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

/** Only files this app put in its own storage folder. */
function ourFile(url: string): boolean {
  // A private file (its app address, or the private store's URL a browser upload answered with).
  const pathname = storedPathname(url);
  if (pathname) return pathname.startsWith(`${DOC_FOLDER}/`);
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com") && parsed.pathname.startsWith(`/${DOC_FOLDER}/`);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const params = request.nextUrl.searchParams;
    if (params.get("counts")) return NextResponse.json({ success: true, counts: await documentCounts() }, noStore);
    const accountId = (params.get("accountId") ?? "").trim();
    if (!accountId) return refuse("Which account?");
    // privateFiles: the page uploads to the private store (lib/files.ts).
    return NextResponse.json({ success: true, ready: await documentsReady(), privateFiles: privateFilesOn(), documents: await listAccountDocuments(accountId) }, noStore);
  } catch (error) {
    console.error("[account-documents GET]", error instanceof Error ? error.message : error);
    return refuse("The documents did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    if (!(await documentsReady())) return refuse("Documents are not turned on yet (migration 074).", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const by = String(identity.name ?? "").trim() || "Staff";

    if (body.action === "add") {
      const accountId = text(body.accountId);
      const docType = text(body.docType) || "Other";
      if (!accountId) return refuse("Which account?");
      if (!isDocType(docType)) return refuse("Pick a type.");
      const files = Array.isArray(body.files) ? (body.files as Record<string, unknown>[]) : [];
      if (files.length === 0) return refuse("Choose at least one file.");
      if (files.length > 20) return refuse("Add up to 20 files at a time.");
      // Every file checked first, so a bad one saves nothing.
      const toAdd: NewDocument[] = [];
      for (const file of files) {
        const url = text(file.url);
        const fileName = text(file.name);
        if (!ourFile(url) || !DOC_EXTENSIONS.test(fileName)) return refuse(`${fileName || "A file"}: not a PDF, Word, Excel or image file.`);
        toAdd.push({
          accountId,
          accountName: text(body.accountName),
          // The name shown: the file's own name without its ending.
          name: fileName.replace(/\.[^.]+$/, "") || fileName,
          docType,
          note: text(body.note),
          // A private upload is saved as the app's address (lib/files.ts).
          fileUrl: toStoredUrl(url),
          fileName,
          fileSize: Number(file.size) || 0,
          contentType: text(file.contentType),
          shareWithSub: body.shareWithSub === true,
          uploadedBy: by,
        });
      }
      const added = [];
      for (const input of toAdd) {
        const doc = await addAccountDocument(input);
        if (doc) added.push(doc);
      }
      return NextResponse.json({ success: true, documents: added });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return refuse("Which document?");

    if (body.action === "update") {
      const docType = body.docType === undefined ? undefined : text(body.docType);
      if (docType !== undefined && !isDocType(docType)) return refuse("Pick a type.");
      if (body.name !== undefined && !text(body.name)) return refuse("Type a name.");
      const doc = await updateAccountDocument(id, {
        name: body.name === undefined ? undefined : text(body.name),
        docType,
        note: body.note === undefined ? undefined : text(body.note),
        shareWithSub: typeof body.shareWithSub === "boolean" ? body.shareWithSub : undefined,
      });
      if (!doc) return refuse("That document was not found.", 404);
      return NextResponse.json({ success: true, document: doc });
    }

    if (body.action === "delete") {
      const doc = await deleteAccountDocument(id);
      if (!doc) return refuse("That document was not found.", 404);
      // An uploaded file goes from storage too; one filed from another record (an estimate) stays there.
      if (!doc.auto && ourFile(doc.fileUrl)) {
        try {
          await del(doc.fileUrl);
        } catch (error) {
          console.error("[account-documents] file not removed from storage:", error instanceof Error ? error.message : error);
        }
      }
      return NextResponse.json({ success: true });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[account-documents POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
