// Reads compared by `npx tsx scripts/migrate/parity.mts catalogs`.
import type { ParityRead } from "../parity.mts";
import {
  fetchDocuments,
  fetchDocumentSends,
  fetchExtraServices,
  getDocumentById,
  getExtraServiceById,
  getGeocodeCacheEntry,
  getRecentChangelogEntries,
} from "../../../lib/data/catalogs";

export const AREA = "CATALOGS";

// IDs for the by-id reads come from whichever source is on, so each side
// looks up its own first row; equal lists mean equal ids.
const firstId = async (list: () => Promise<{ id: string }[]>) => (await list())[0]?.id ?? "";

export const reads: ParityRead[] = [
  { name: "getRecentChangelogEntries(3)", run: () => getRecentChangelogEntries(3) },
  { name: "getRecentChangelogEntries(50)", run: () => getRecentChangelogEntries(50) },
  { name: "fetchExtraServices", run: () => fetchExtraServices() },
  { name: "getExtraServiceById(first)", run: async () => getExtraServiceById(await firstId(fetchExtraServices)) },
  { name: "getExtraServiceById(missing)", run: () => getExtraServiceById("SVC-does-not-exist") },
  { name: "fetchDocuments", run: () => fetchDocuments() },
  { name: "getDocumentById(first)", run: async () => getDocumentById(await firstId(fetchDocuments)) },
  { name: "getDocumentById(missing)", run: () => getDocumentById("DOC-does-not-exist") },
  { name: "fetchDocumentSends()", run: () => fetchDocumentSends() },
  {
    name: "fetchDocumentSends(first document)",
    run: async () => fetchDocumentSends((await fetchDocumentSends())[0]?.documentId ?? ""),
  },
  { name: "getGeocodeCacheEntry(missing)", run: () => getGeocodeCacheEntry("1 Nowhere Street, Nowhere, NJ") },
];
