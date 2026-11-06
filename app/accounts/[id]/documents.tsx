"use client";

// The account page's "Documents": every file the account has, in one place,
// newest first. Staff upload what the customer sends (scope of work, cleaning
// routine, floor plan, contract, ...); the app files the accepted estimates
// and each sent Welcome Packet here itself. Each file has a type, an optional
// note, who uploaded it and when, and "Share with sub" (off by default): on,
// the account's sub sees it in their portal and the crew on Crew Link (view /
// download only). Customers never see these. Rename, change the type, the
// note or the switch, or delete (with a confirm).
// Files go straight from the browser to file storage
// (POST /api/account-documents/upload), then are saved with
// POST /api/account-documents. English / Spanish switch on the card.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { upload } from "@vercel/blob/client";
import { BigButton, Card, ConfirmSheet, Field, SelectField, Sheet, StatusPill, TextAreaField } from "@/app/ui";
import { DOC_ACCEPT, DOC_EXTENSIONS, DOC_FOLDER, DOC_MAX_BYTES, DOC_TYPES, docTypeWord, sizeText, type AccountDocument, type DocType } from "@/lib/accountDocuments";

type Lang = "en" | "es";

const WORDS = {
  en: {
    title: "Documents",
    language: "Español",
    upload: "Upload document",
    uploadTitle: "Upload documents",
    uploadText: "PDF, Word, Excel or pictures, up to 25 MB each. You can pick several at once.",
    files: "Files",
    type: "Type",
    note: "Note",
    notePlaceholder: "Updated scope from Julia, Nov 2026",
    share: "Share with sub",
    shareHint: "The sub sees it in their portal and on Crew Link. Customers never see documents.",
    save: "Upload",
    saving: (done: number, total: number) => `Uploading ${done} of ${total}…`,
    pick: "Choose at least one file.",
    badFile: (name: string) => `${name}: use a PDF, Word, Excel or picture file.`,
    tooBig: (name: string) => `${name}: bigger than 25 MB.`,
    failed: "That did not save. Try again.",
    empty: "No documents yet. Upload what the customer sends us: scope of work, cleaning routine, floor plan, contract.",
    notReady: "Documents are not turned on yet (migration 074).",
    by: (who: string, when: string) => `${who || "Someone"} · ${when}`,
    filed: "Filed by the app",
    shared: "Shared with sub",
    edit: "Edit",
    editTitle: "Edit document",
    name: "Name",
    saveChanges: "Save",
    delete: "Delete",
    deleteTitle: "Delete this document?",
    deleteText: (name: string) => `"${name}" is removed from the account. This cannot be undone.`,
    deleteConfirm: "Delete document",
    deleting: "Deleting…",
    open: "Open",
  },
  es: {
    title: "Documentos",
    language: "English",
    upload: "Subir documento",
    uploadTitle: "Subir documentos",
    uploadText: "PDF, Word, Excel o fotos, hasta 25 MB cada uno. Puedes elegir varios a la vez.",
    files: "Archivos",
    type: "Tipo",
    note: "Nota",
    notePlaceholder: "Alcance nuevo de Julia, nov 2026",
    share: "Compartir con el sub",
    shareHint: "El sub lo ve en su portal y en Crew Link. Los clientes nunca ven los documentos.",
    save: "Subir",
    saving: (done: number, total: number) => `Subiendo ${done} de ${total}…`,
    pick: "Elige al menos un archivo.",
    badFile: (name: string) => `${name}: usa un PDF, Word, Excel o una foto.`,
    tooBig: (name: string) => `${name}: pesa más de 25 MB.`,
    failed: "No se guardó. Intenta de nuevo.",
    empty: "Todavía no hay documentos. Sube lo que nos manda el cliente: alcance del trabajo, rutina de limpieza, plano, contrato.",
    notReady: "Los documentos todavía no están activados (migración 074).",
    by: (who: string, when: string) => `${who || "Alguien"} · ${when}`,
    filed: "Archivado por la app",
    shared: "Compartido con el sub",
    edit: "Editar",
    editTitle: "Editar documento",
    name: "Nombre",
    saveChanges: "Guardar",
    delete: "Borrar",
    deleteTitle: "¿Borrar este documento?",
    deleteText: (name: string) => `"${name}" se quita de la cuenta. No se puede deshacer.`,
    deleteConfirm: "Borrar documento",
    deleting: "Borrando…",
    open: "Abrir",
  },
} as const;

type Words = (typeof WORDS)[Lang];

// The choice is kept in this browser.
const LANG_KEY = "cw-account-docs-lang";
const LANG_EVENT = "cw-account-docs-lang";
function readLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}
function subscribeLang(onChange: () => void) {
  window.addEventListener(LANG_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LANG_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function useLang(): [Lang, () => void] {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "en" as Lang);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(LANG_KEY, readLang() === "es" ? "en" : "es");
    } catch {
      // No storage: the switch just does not stick.
    }
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);
  return [lang, toggle];
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/account-documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "");
  return data;
}

const whenText = (iso: string, lang: Lang) =>
  iso ? new Date(iso).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

/** A storage name that keeps the file's own name readable. */
function storagePath(accountId: string, file: File): string {
  const safe = file.name.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-80) || "document";
  return `${DOC_FOLDER}/${accountId.replace(/[^\w-]+/g, "") || "account"}/${safe}`;
}

export default function AccountDocuments({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [lang, toggleLang] = useLang();
  const w = WORDS[lang];
  const [state, setState] = useState<{ ready: boolean; documents: AccountDocument[] } | null>(null);
  const [version, setVersion] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<AccountDocument | null>(null);
  const [deleting, setDeleting] = useState<AccountDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/account-documents?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; ready?: boolean; documents?: AccountDocument[] }) => {
        if (alive && data.success) setState({ ready: data.ready === true, documents: data.documents ?? [] });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId, version]);

  const reload = () => setVersion((value) => value + 1);

  async function flipShare(doc: AccountDocument) {
    setError("");
    // Shown at once; put back when it did not save.
    setState((current) => (current ? { ...current, documents: current.documents.map((item) => (item.id === doc.id ? { ...item, shareWithSub: !doc.shareWithSub } : item)) } : current));
    try {
      await post({ action: "update", id: doc.id, shareWithSub: !doc.shareWithSub });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : w.failed);
      reload();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setError("");
    try {
      await post({ action: "delete", id: deleting.id });
      setDeleting(null);
      reload();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : w.failed);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!state) return null;
  const count = state.documents.length;

  return (
    <Card
      title={`📎 ${w.title}${count > 0 ? ` (${count})` : ""}`}
      right={
        <button type="button" className="ui-link" onClick={toggleLang}>
          {w.language}
        </button>
      }
    >
      {!state.ready ? (
        <p className="ui-muted">{w.notReady}</p>
      ) : (
        <>
          <BigButton kind="second" icon="plus" onClick={() => setUploadOpen(true)}>
            {w.upload}
          </BigButton>
          {error ? (
            <p className="ui-field-error" role="alert">
              {error}
            </p>
          ) : null}
          {count === 0 ? (
            <p className="ui-muted">{w.empty}</p>
          ) : (
            <ul className="ui-stack" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
              {state.documents.map((doc) => (
                <li key={doc.id} className="ui-stat" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ui-account-link" style={{ fontSize: 18 }}>
                    {doc.name}
                  </a>
                  <div className="ui-actions-row">
                    <StatusPill kind="off">{docTypeWord(doc.docType, lang)}</StatusPill>
                    {doc.shareWithSub ? <StatusPill kind="done">{w.shared}</StatusPill> : null}
                  </div>
                  {doc.note ? <p className="ui-card-text">{doc.note}</p> : null}
                  <p className="ui-muted" style={{ margin: 0 }}>
                    {doc.auto ? `${w.filed} · ` : ""}
                    {w.by(doc.uploadedBy, whenText(doc.uploadedAt, lang))}
                    {doc.fileSize > 0 ? ` · ${sizeText(doc.fileSize)}` : ""}
                  </p>
                  <label className="ui-toggle">
                    <input type="checkbox" role="switch" checked={doc.shareWithSub} onChange={() => void flipShare(doc)} />
                    <span>{w.share}</span>
                  </label>
                  <div className="ui-actions-row">
                    <BigButton kind="quiet" onClick={() => setEditing(doc)}>
                      {w.edit}
                    </BigButton>
                    <BigButton kind="quiet" onClick={() => setDeleting(doc)}>
                      {w.delete}
                    </BigButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {uploadOpen ? (
        <UploadSheet
          w={w}
          lang={lang}
          accountId={accountId}
          accountName={accountName}
          onClose={() => setUploadOpen(false)}
          onSaved={() => {
            setUploadOpen(false);
            reload();
          }}
        />
      ) : null}
      {editing ? (
        <EditSheet
          key={editing.id}
          w={w}
          lang={lang}
          doc={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      <ConfirmSheet
        open={deleting !== null}
        title={w.deleteTitle}
        text={deleting ? w.deleteText(deleting.name) : ""}
        confirmLabel={w.deleteConfirm}
        busy={deleteBusy}
        busyLabel={w.deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

function TypeSelect({ w, lang, value, onChange, disabled }: { w: Words; lang: Lang; value: string; onChange: (value: DocType) => void; disabled?: boolean }) {
  return (
    <SelectField label={w.type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as DocType)}>
      {DOC_TYPES.map((type) => (
        <option key={type} value={type}>
          {docTypeWord(type, lang)}
        </option>
      ))}
    </SelectField>
  );
}

function UploadSheet({ w, lang, accountId, accountName, onClose, onSaved }: { w: Words; lang: Lang; accountId: string; accountName: string; onClose: () => void; onSaved: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<DocType>("Scope of work");
  const [note, setNote] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (files.length === 0) return setError(w.pick);
    const bad = files.find((file) => !DOC_EXTENSIONS.test(file.name));
    if (bad) return setError(w.badFile(bad.name));
    const big = files.find((file) => file.size > DOC_MAX_BYTES);
    if (big) return setError(w.tooBig(big.name));
    try {
      const uploaded: { url: string; name: string; size: number; contentType: string }[] = [];
      for (const [index, file] of files.entries()) {
        setBusy(w.saving(index + 1, files.length));
        const blob = await upload(storagePath(accountId, file), file, { access: "public", handleUploadUrl: "/api/account-documents/upload", contentType: file.type || undefined });
        uploaded.push({ url: blob.url, name: file.name, size: file.size, contentType: file.type });
      }
      await post({ action: "add", accountId, accountName, docType, note, shareWithSub: share, files: uploaded });
      onSaved();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : w.failed);
    } finally {
      setBusy("");
    }
  }

  return (
    <Sheet
      open
      title={w.uploadTitle}
      text={w.uploadText}
      onClose={onClose}
      busy={Boolean(busy)}
      actions={
        <BigButton busy={Boolean(busy)} busyLabel={busy} onClick={() => void save()}>
          {w.save}
        </BigButton>
      }
    >
      <div className="ui-stack">
        <Field
          label={w.files}
          type="file"
          multiple
          accept={DOC_ACCEPT}
          disabled={Boolean(busy)}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        {files.length > 0 ? (
          <ul className="ui-muted" style={{ margin: 0, paddingLeft: 20 }}>
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`}>
                {file.name} · {sizeText(file.size)}
              </li>
            ))}
          </ul>
        ) : null}
        <TypeSelect w={w} lang={lang} value={docType} onChange={setDocType} disabled={Boolean(busy)} />
        <TextAreaField label={w.note} optional value={note} placeholder={w.notePlaceholder} maxLength={500} disabled={Boolean(busy)} onChange={(event) => setNote(event.target.value)} />
        <label className="ui-toggle">
          <input type="checkbox" role="switch" checked={share} disabled={Boolean(busy)} onChange={(event) => setShare(event.target.checked)} />
          <span>{w.share}</span>
        </label>
        <p className="ui-muted" style={{ margin: 0 }}>
          {w.shareHint}
        </p>
        {error ? (
          <p className="ui-field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

function EditSheet({ w, lang, doc, onClose, onSaved }: { w: Words; lang: Lang; doc: AccountDocument; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(doc.name);
  const [docType, setDocType] = useState<string>(doc.docType);
  const [note, setNote] = useState(doc.note);
  const [share, setShare] = useState(doc.shareWithSub);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setBusy(true);
    try {
      await post({ action: "update", id: doc.id, name, docType, note, shareWithSub: share });
      onSaved();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : w.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      title={w.editTitle}
      onClose={onClose}
      busy={busy}
      actions={
        <BigButton busy={busy} onClick={() => void save()}>
          {w.saveChanges}
        </BigButton>
      }
    >
      <div className="ui-stack">
        <Field label={w.name} value={name} maxLength={200} disabled={busy} onChange={(event) => setName(event.target.value)} />
        <TypeSelect w={w} lang={lang} value={docType} onChange={setDocType} disabled={busy} />
        <TextAreaField label={w.note} optional value={note} maxLength={500} disabled={busy} onChange={(event) => setNote(event.target.value)} />
        <label className="ui-toggle">
          <input type="checkbox" role="switch" checked={share} disabled={busy} onChange={(event) => setShare(event.target.checked)} />
          <span>{w.share}</span>
        </label>
        <p className="ui-muted" style={{ margin: 0 }}>
          {w.shareHint}
        </p>
        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ui-link">
          {w.open}: {doc.fileName || doc.name}
        </a>
        {error ? (
          <p className="ui-field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
