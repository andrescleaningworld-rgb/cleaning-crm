// Postgres versions of the catalog reads/writes in lib/googleSheets.ts
// (ChangeLog, ExtraServices, Documents, DocumentSends, GeocodeCache).
// Same function names, arguments, return shapes, ordering and error
// messages, so lib/data/catalogs.ts can switch between the two.
//
// Sheet order is kept with ORDER BY source_row NULLS LAST, created_at, id:
// imported rows in their sheet order, rows created here after them in the
// order they were made (which is where Sheets would have appended them).
// sheetRow is the row's position at import time (0 for rows created here);
// nothing may use it to address a row.

import { getSql } from "@/lib/db";
import type {
  ChangelogEntry,
  CwDocument,
  DocumentInput,
  DocumentSend,
  DocumentSendInput,
  ExtraService,
  ExtraServiceInput,
  ExtraServiceUpdateInput,
  GeocodeCacheEntry,
} from "@/lib/googleSheets";

const SHEET_ORDER = "source_row NULLS LAST, created_at, id";

// Same id shape as lib/googleSheets.ts: PREFIX-<last 8 chars of the UTC
// timestamp>-<4 random chars>.
function newId(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp.slice(-8)}-${rand}`;
}

/* ---------- ChangeLog ---------- */

export async function getRecentChangelogEntries(limit = 3): Promise<ChangelogEntry[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT entry_date_raw, version, description FROM changelog_entries ORDER BY ${SHEET_ORDER}`
  )) as { entry_date_raw: string; version: string; description: string }[];

  // Same steps as the Sheets version: last `limit` rows, newest first, then
  // drop rows without a description.
  return rows
    .slice(-limit)
    .reverse()
    .map((row) => ({
      date: row.entry_date_raw.trim(),
      version: row.version.trim(),
      description: row.description.trim(),
    }))
    .filter((entry) => entry.description);
}

/* ---------- ExtraServices ---------- */

type ExtraServiceRow = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  active: boolean;
  sort_order: number;
  source_row: number | null;
};

export async function fetchExtraServices(): Promise<ExtraService[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, name, description, image_url, active, sort_order, source_row FROM extra_services ORDER BY ${SHEET_ORDER}`
  )) as ExtraServiceRow[];
  return rows.map((row) => ({
    sheetRow: row.source_row ?? 0,
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    active: row.active,
    sortOrder: row.sort_order,
  }));
}

export async function getExtraServiceById(id: string): Promise<ExtraService | null> {
  const targetId = id.trim();
  if (!targetId) return null;
  const services = await fetchExtraServices();
  return services.find((s) => s.id === targetId) ?? null;
}

export async function appendExtraService(data: ExtraServiceInput): Promise<string> {
  const sql = getSql();
  const id = newId("SVC");
  await sql`
    INSERT INTO extra_services (id, legacy_key, name, description, image_url, active, sort_order)
    VALUES (${id}, ${id}, ${data.name}, ${data.description}, ${data.imageUrl}, ${data.active}, ${Math.trunc(data.sortOrder) || 0})
  `;
  return id;
}

export async function updateExtraService(id: string, fields: ExtraServiceUpdateInput): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing extra service id.");

  const sql = getSql();
  // COALESCE keeps the current value for every field that was not sent,
  // the same partial-update contract as the Sheets version.
  const updated = await sql`
    UPDATE extra_services SET
      name        = COALESCE(${fields.name ?? null}, name),
      description = COALESCE(${fields.description ?? null}, description),
      image_url   = COALESCE(${fields.imageUrl ?? null}, image_url),
      active      = COALESCE(${fields.active ?? null}, active),
      sort_order  = COALESCE(${fields.sortOrder === undefined ? null : Math.trunc(fields.sortOrder) || 0}, sort_order),
      updated_at  = now()
    WHERE id = ${targetId}
    RETURNING id
  `;
  if (updated.length === 0) {
    throw new Error(`Extra service "${targetId}" not found.`);
  }
}

/* ---------- Documents ---------- */

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  file_name: string;
  file_url: string;
  file_size: string | number;
  uploaded_at_raw: string;
  uploaded_by: string;
  source_row: number | null;
};

export async function fetchDocuments(): Promise<CwDocument[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, name, category, file_name, file_url, file_size, uploaded_at_raw, uploaded_by, source_row
     FROM documents ORDER BY ${SHEET_ORDER}`
  )) as DocumentRow[];
  return rows.map((row) => ({
    sheetRow: row.source_row ?? 0,
    id: row.id,
    name: row.name,
    category: row.category,
    fileName: row.file_name,
    fileUrl: row.file_url,
    fileSize: Number(row.file_size) || 0,
    uploadedAt: row.uploaded_at_raw,
    uploadedBy: row.uploaded_by,
  }));
}

export async function getDocumentById(id: string): Promise<CwDocument | null> {
  const targetId = id.trim();
  if (!targetId) return null;
  const documents = await fetchDocuments();
  return documents.find((d) => d.id === targetId) ?? null;
}

export async function appendDocument(data: DocumentInput): Promise<string> {
  const sql = getSql();
  const id = newId("DOC");
  const uploadedAt = new Date().toISOString();
  await sql`
    INSERT INTO documents (id, legacy_key, name, category, file_name, file_url, file_size, uploaded_at, uploaded_at_raw, uploaded_by)
    VALUES (${id}, ${id}, ${data.name}, ${data.category}, ${data.fileName}, ${data.fileUrl},
            ${Math.trunc(data.fileSize) || 0}, ${uploadedAt}, ${uploadedAt}, ${data.uploadedBy})
  `;
  return id;
}

// Hard delete, same as the Sheets version (the caller deletes the Blob
// first). The send history in document_sends stays.
export async function deleteDocument(id: string): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing document id.");

  const sql = getSql();
  const deleted = await sql`DELETE FROM documents WHERE id = ${targetId} RETURNING id`;
  if (deleted.length === 0) {
    throw new Error(`Document "${targetId}" not found.`);
  }
}

/* ---------- DocumentSends ---------- */

type DocumentSendRow = {
  id: string;
  document_id: string;
  document_name: string;
  subcontractor_id_raw: string;
  subcontractor_name: string;
  sent_by: string;
  sent_at_raw: string;
  note: string;
  source_row: number | null;
};

export async function fetchDocumentSends(documentId?: string): Promise<DocumentSend[]> {
  const targetId = documentId?.trim();
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, document_id, document_name, subcontractor_id_raw, subcontractor_name, sent_by, sent_at_raw, note, source_row
     FROM document_sends ORDER BY ${SHEET_ORDER}`
  )) as DocumentSendRow[];
  return rows
    .map((row) => ({
      sheetRow: row.source_row ?? 0,
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      // The app still speaks row-position ids (SUB-ROW-n) until Area 3.
      subcontractorId: row.subcontractor_id_raw,
      subcontractorName: row.subcontractor_name,
      sentBy: row.sent_by,
      sentAt: row.sent_at_raw,
      note: row.note,
    }))
    .filter((s) => !targetId || s.documentId === targetId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export async function appendDocumentSend(data: DocumentSendInput): Promise<string> {
  const sql = getSql();
  const id = newId("SEND");
  const sentAt = new Date().toISOString();
  await sql`
    INSERT INTO document_sends
      (id, legacy_key, document_id, document_name, subcontractor_id_raw, subcontractor_name, sent_by, sent_at, sent_at_raw, note)
    VALUES (${id}, ${id}, ${data.documentId}, ${data.documentName}, ${data.subcontractorId}, ${data.subcontractorName},
            ${data.sentBy}, ${sentAt}, ${sentAt}, ${data.note})
  `;
  return id;
}

/* ---------- GeocodeCache ---------- */

export async function getGeocodeCacheEntry(address: string): Promise<GeocodeCacheEntry | null> {
  const normalized = address.trim();
  if (!normalized) return null;

  const sql = getSql();
  const rows = await sql`SELECT latitude, longitude FROM geocode_cache WHERE address = ${normalized}`;
  if (rows.length === 0) return null;

  const latitude = Number(rows[0].latitude);
  const longitude = Number(rows[0].longitude);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
}

// Sheets appends a second row when an address is cached twice and lookups
// use the first one. Keeping the first row here gives the same answer.
export async function appendGeocodeCacheEntry(address: string, latitude: number, longitude: number): Promise<void> {
  const normalized = address.trim();
  const geocodedAt = new Date().toISOString();
  const sql = getSql();
  await sql`
    INSERT INTO geocode_cache (address, legacy_key, latitude, longitude, geocoded_at, geocoded_at_raw)
    VALUES (${normalized}, ${normalized}, ${latitude}, ${longitude}, ${geocodedAt}, ${geocodedAt})
    ON CONFLICT (address) DO NOTHING
  `;
}
