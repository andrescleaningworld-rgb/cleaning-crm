// Account documents (migration 074, account_documents): every file an account
// has, in one place. Staff upload them on the account page; the app files the
// accepted estimates and each sent Welcome Packet itself. With "Share with
// sub" on, the account's sub sees the file in their portal and the crew on
// Crew Link (view / download only). Customers never see these.
// Before migration 074 every read is empty and nothing is saved.

import { getSql } from "@/lib/db";
import type { AccountDocument, SharedDocument } from "@/lib/accountDocuments";

let ready: boolean | null = null;
export async function documentsReady(): Promise<boolean> {
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.account_documents') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

type Row = {
  id: string | number;
  account_id: string;
  account_name: string;
  name: string;
  doc_type: string;
  note: string;
  file_url: string;
  file_name: string;
  file_size: string | number;
  content_type: string;
  share_with_sub: boolean;
  source_key: string | null;
  uploaded_by: string;
  uploaded_at: string | Date;
};

const iso = (value: string | Date) => (value instanceof Date ? value.toISOString() : String(value ?? ""));

function toDocument(row: Row): AccountDocument {
  return {
    id: Number(row.id),
    accountId: row.account_id,
    accountName: row.account_name,
    name: row.name,
    docType: row.doc_type,
    note: row.note,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileSize: Number(row.file_size) || 0,
    contentType: row.content_type,
    shareWithSub: row.share_with_sub === true,
    auto: Boolean(row.source_key),
    uploadedBy: row.uploaded_by,
    uploadedAt: iso(row.uploaded_at),
  };
}

const toShared = (row: Row): SharedDocument => {
  const doc = toDocument(row);
  return { id: doc.id, accountId: doc.accountId, accountName: doc.accountName, name: doc.name, docType: doc.docType, fileUrl: doc.fileUrl, fileName: doc.fileName, fileSize: doc.fileSize, uploadedAt: doc.uploadedAt };
};

/** One account's documents, newest first. */
export async function listAccountDocuments(accountId: string): Promise<AccountDocument[]> {
  if (!(await documentsReady())) return [];
  const rows = (await getSql()`SELECT * FROM account_documents WHERE account_id = ${accountId.trim()} ORDER BY uploaded_at DESC, id DESC`) as Row[];
  return rows.map(toDocument);
}

/** How many documents each account has (Accounts center's 📎). */
export async function documentCounts(): Promise<Record<string, number>> {
  if (!(await documentsReady())) return {};
  const rows = (await getSql()`SELECT account_id, count(*)::int AS n FROM account_documents GROUP BY account_id`) as { account_id: string; n: number }[];
  return Object.fromEntries(rows.map((row) => [row.account_id, row.n]));
}

export type NewDocument = {
  accountId: string;
  accountName: string;
  name: string;
  docType: string;
  note?: string;
  fileUrl: string;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  shareWithSub?: boolean;
  uploadedBy: string;
  /** Set when the app files it itself, so it is filed once. */
  sourceKey?: string;
};

export async function addAccountDocument(input: NewDocument): Promise<AccountDocument | null> {
  if (!(await documentsReady())) return null;
  const rows = (await getSql()`
    INSERT INTO account_documents (account_id, account_name, name, doc_type, note, file_url, file_name, file_size, content_type, share_with_sub, source_key, uploaded_by)
    VALUES (${input.accountId.trim()}, ${input.accountName}, ${input.name.trim().slice(0, 200)}, ${input.docType}, ${(input.note ?? "").trim().slice(0, 500)},
      ${input.fileUrl}, ${input.fileName ?? ""}, ${Math.max(0, Math.round(input.fileSize ?? 0))}, ${input.contentType ?? ""}, ${input.shareWithSub === true},
      ${input.sourceKey ?? null}, ${input.uploadedBy})
    ON CONFLICT (source_key) DO NOTHING
    RETURNING *`) as Row[];
  return rows[0] ? toDocument(rows[0]) : null;
}

/** The app files one of its own (an accepted estimate, a sent Welcome Packet). Never throws. */
export async function fileAccountDocument(input: NewDocument & { sourceKey: string }): Promise<void> {
  try {
    await addAccountDocument(input);
  } catch (error) {
    console.error("[account-documents] not filed:", input.sourceKey, error instanceof Error ? error.message : error);
  }
}

export async function getAccountDocument(id: number): Promise<AccountDocument | null> {
  if (!(await documentsReady())) return null;
  const rows = (await getSql()`SELECT * FROM account_documents WHERE id = ${id}`) as Row[];
  return rows[0] ? toDocument(rows[0]) : null;
}

export async function updateAccountDocument(id: number, changes: { name?: string; docType?: string; note?: string; shareWithSub?: boolean }): Promise<AccountDocument | null> {
  const current = await getAccountDocument(id);
  if (!current) return null;
  const rows = (await getSql()`
    UPDATE account_documents SET
      name = ${(changes.name ?? current.name).trim().slice(0, 200) || current.name},
      doc_type = ${changes.docType ?? current.docType},
      note = ${(changes.note ?? current.note).trim().slice(0, 500)},
      share_with_sub = ${changes.shareWithSub ?? current.shareWithSub},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`) as Row[];
  return rows[0] ? toDocument(rows[0]) : null;
}

export async function deleteAccountDocument(id: number): Promise<AccountDocument | null> {
  if (!(await documentsReady())) return null;
  const rows = (await getSql()`DELETE FROM account_documents WHERE id = ${id} RETURNING *`) as Row[];
  return rows[0] ? toDocument(rows[0]) : null;
}

/** The one sub record with this login email (none when two records share it). */
const SUB_BY_EMAIL = `(SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE btrim($1) <> '' AND lower(btrim(email)) = lower(btrim($1)))`;

/** The shared documents of the sub's accounts (not cancelled), by account then newest first. */
export async function listSharedForSub(email: string): Promise<SharedDocument[]> {
  if (!(await documentsReady())) return [];
  const rows = (await getSql().query(
    `SELECT d.*, a.account_name AS account_name
     FROM account_documents d
     JOIN accounts a ON a.id = d.account_id
     WHERE d.share_with_sub AND a.is_test = false AND (to_jsonb(a) ->> 'deleted_at') IS NULL
       AND a.status_key NOT IN ('cancelled', 'inactive') AND a.subcontractor_id = ${SUB_BY_EMAIL}
     ORDER BY lower(a.account_name), d.uploaded_at DESC, d.id DESC`,
    [email]
  )) as Row[];
  return rows.map(toShared);
}

/** The shared documents of one account (Crew Link). */
export async function listSharedForAccount(accountId: string): Promise<SharedDocument[]> {
  if (!(await documentsReady())) return [];
  const rows = (await getSql()`SELECT * FROM account_documents WHERE account_id = ${accountId.trim()} AND share_with_sub ORDER BY uploaded_at DESC, id DESC`) as Row[];
  return rows.map(toShared);
}
