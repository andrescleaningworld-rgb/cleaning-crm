// Catalogs & logs (ChangeLog, ExtraServices, Documents, DocumentSends,
// GeocodeCache). Routes import from here; DATA_SOURCE_CATALOGS decides
// whether a call goes to Google Sheets (default, today's behavior) or to
// Postgres. Function names and return shapes are identical on both sides.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/catalogs";

export type {
  ChangelogEntry,
  CwDocument,
  DocumentCategory,
  DocumentInput,
  DocumentSend,
  DocumentSendInput,
  ExtraService,
  ExtraServiceInput,
  ExtraServiceUpdateInput,
  GeocodeCacheEntry,
} from "@/lib/googleSheets";

// A constant, not data: the same list whichever source is on.
export { DOCUMENT_CATEGORIES } from "@/lib/googleSheets";

const source = () => (isPostgres("CATALOGS") ? pg : sheets);

export const getRecentChangelogEntries: typeof sheets.getRecentChangelogEntries = (...args) =>
  source().getRecentChangelogEntries(...args);

export const fetchExtraServices: typeof sheets.fetchExtraServices = () => source().fetchExtraServices();
export const getExtraServiceById: typeof sheets.getExtraServiceById = (...args) => source().getExtraServiceById(...args);
export const appendExtraService: typeof sheets.appendExtraService = (...args) => source().appendExtraService(...args);
export const updateExtraService: typeof sheets.updateExtraService = (...args) => source().updateExtraService(...args);

export const fetchDocuments: typeof sheets.fetchDocuments = () => source().fetchDocuments();
export const getDocumentById: typeof sheets.getDocumentById = (...args) => source().getDocumentById(...args);
export const appendDocument: typeof sheets.appendDocument = (...args) => source().appendDocument(...args);
export const deleteDocument: typeof sheets.deleteDocument = (...args) => source().deleteDocument(...args);

export const fetchDocumentSends: typeof sheets.fetchDocumentSends = (...args) => source().fetchDocumentSends(...args);
export const appendDocumentSend: typeof sheets.appendDocumentSend = (...args) => source().appendDocumentSend(...args);

export const getGeocodeCacheEntry: typeof sheets.getGeocodeCacheEntry = (...args) => source().getGeocodeCacheEntry(...args);
export const appendGeocodeCacheEntry: typeof sheets.appendGeocodeCacheEntry = (...args) =>
  source().appendGeocodeCacheEntry(...args);
