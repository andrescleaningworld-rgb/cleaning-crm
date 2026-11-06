// Account documents (migration 074): the types and their words, shared by the
// account page, the sub portal and Crew Link. Plain TS, no server imports.

export const DOC_TYPES = ["Scope of work", "Cleaning routine", "Floor plan", "Contract", "Accepted estimate", "Welcome packet", "Other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export function isDocType(value: unknown): value is DocType {
  return typeof value === "string" && (DOC_TYPES as readonly string[]).includes(value);
}

export type DocLang = "en" | "es" | "pt";

/** The type's name in each language (English is the stored value). */
export const DOC_TYPE_WORDS: Record<DocLang, Record<DocType, string>> = {
  en: {
    "Scope of work": "Scope of work",
    "Cleaning routine": "Cleaning routine",
    "Floor plan": "Floor plan",
    Contract: "Contract",
    "Accepted estimate": "Accepted estimate",
    "Welcome packet": "Welcome packet",
    Other: "Other",
  },
  es: {
    "Scope of work": "Alcance del trabajo",
    "Cleaning routine": "Rutina de limpieza",
    "Floor plan": "Plano",
    Contract: "Contrato",
    "Accepted estimate": "Estimado aceptado",
    "Welcome packet": "Paquete de bienvenida",
    Other: "Otro",
  },
  pt: {
    "Scope of work": "Escopo do trabalho",
    "Cleaning routine": "Rotina de limpeza",
    "Floor plan": "Planta",
    Contract: "Contrato",
    "Accepted estimate": "Orçamento aceito",
    "Welcome packet": "Pacote de boas-vindas",
    Other: "Outro",
  },
};

export const docTypeWord = (type: string, lang: DocLang) => (isDocType(type) ? DOC_TYPE_WORDS[lang][type] : type);

/** What staff may upload: PDF, Word, Excel or images. */
export const DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,image/*,application/pdf";
export const DOC_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/*",
  // Some phones and browsers send no type for Word / Excel files; the ending is checked instead.
  "application/octet-stream",
];
export const DOC_EXTENSIONS = /\.(pdf|docx?|xlsx?|csv|jpe?g|png|webp|heic|heif|gif)$/i;
export const DOC_MAX_BYTES = 25 * 1024 * 1024;
/** Where uploads are kept in file storage. */
export const DOC_FOLDER = "account-documents";

/** One document as every screen gets it. */
export type AccountDocument = {
  id: number;
  accountId: string;
  accountName: string;
  name: string;
  docType: string;
  note: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  shareWithSub: boolean;
  /** Filed by the app (an accepted estimate, a sent Welcome Packet), not uploaded. */
  auto: boolean;
  uploadedBy: string;
  uploadedAt: string;
};

/** The document as a sub or a crew sees it: nothing about who uploaded it or staff notes. */
export type SharedDocument = Pick<AccountDocument, "id" | "accountId" | "accountName" | "name" | "docType" | "fileUrl" | "fileName" | "fileSize" | "uploadedAt">;

export function sizeText(bytes: number): string {
  if (!(bytes > 0)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
