"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BigButton,
  Card,
  CardList,
  ConfirmSheet,
  EmptyState,
  ErrorBox,
  Field,
  LABELS,
  MoreMenu,
  PersonPicker,
  SaveStatus,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  SkeletonList,
  Tabs,
  TextAreaField,
  useSaveAction,
  useUiWords,
} from "@/app/ui";

type CwDocument = {
  sheetRow: number;
  id: string;
  name: string;
  category: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
};

// Raw shape returned by GET /api/subcontractors — the same source used by
// the Subcontractor dropdown in app/accounts/new/page.tsx and Sub Center.
// Field names are already normalized by getAllSubcontractorsRaw in
// lib/googleSheets.ts, so no alias-guessing is needed here.
type RawSubcontractor = {
  id: string;
  companyName?: string;
  contactName?: string;
  email?: string;
};

type SubcontractorOption = {
  id: string;
  label: string;
  email: string;
};

type DocumentSend = {
  sheetRow: number;
  id: string;
  documentId: string;
  documentName: string;
  subcontractorId: string;
  subcontractorName: string;
  sentBy: string;
  sentAt: string;
  note: string;
};

const CATEGORIES = ["Contract", "Handbook", "Policy", "Other"] as const;
type Category = (typeof CATEGORIES)[number];
const MAX_FILE_SIZE_MB = 10;

// Same self-declared identity used by app/sub-schedules/page.tsx
// ("cwAdminName") — admin actions are attributed to whatever name staff last
// typed in, shared via localStorage across pages.
function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "Tue, Oct 7" (with the year when it is not this year).
function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDate(iso)}, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function subcontractorLabel(sub: RawSubcontractor): string {
  return sub.contactName?.trim() || sub.companyName?.trim() || sub.email?.trim() || "Unnamed subcontractor";
}

/** Calls an API route and throws a plain-words Error when it did not work. */
async function api<T extends { success?: boolean; error?: string }>(
  url: string,
  init: RequestInit | undefined,
  failText: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("The internet dropped. Check your connection and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as T;
  if (!data.success) throw new Error(data.error || failText);
  return data;
}

function AddDocumentSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => Promise<void> }) {
  return (
    <AddDocumentForm key={open ? "open" : "closed"} open={open} onClose={onClose} onAdded={onAdded} />
  );
}

function AddDocumentForm({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => Promise<void> }) {
  const words = useUiWords();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("Contract");
  const [file, setFile] = useState<File | null>(null);
  const [nameError, setNameError] = useState("");
  const [fileError, setFileError] = useState("");

  const save = useSaveAction(
    async (docName: string, docCategory: Category, docFile: File) => {
      const formData = new FormData();
      formData.append("file", docFile);
      formData.append("name", docName);
      formData.append("category", docCategory);
      await api("/api/documents", { method: "POST", body: formData }, "The document was not added.");
      await onAdded();
    },
    { savedMessage: "Document added", onSaved: onClose }
  );

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFileError("");
    if (selected && selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFileError(`That file is too big. Pick one that is ${MAX_FILE_SIZE_MB} MB or smaller.`);
      event.target.value = "";
      setFile(null);
      return;
    }
    setFile(selected);
  }

  function handleAdd() {
    const trimmedName = name.trim();
    setNameError(trimmedName ? "" : "Type a name for this document.");
    setFileError(file ? "" : "Pick a file to add.");
    if (!trimmedName || !file) return;
    void save.run(trimmedName, category, file);
  }

  return (
    <Sheet
      open={open}
      title="Add a document"
      text="Keep subcontractor contracts, handbooks and policies here for the team."
      onClose={onClose}
      busy={save.saving}
      actions={
        <BigButton busy={save.saving} busyLabel="Adding…" onClick={handleAdd}>
          Add document
        </BigButton>
      }
    >
      <Field
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="2026 Subcontractor Agreement"
        disabled={save.saving}
        error={nameError}
      />
      <SelectField
        label="Category"
        value={category}
        onChange={(event) => setCategory(event.target.value as Category)}
        disabled={save.saving}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>
      <Field
        label="File"
        type="file"
        hint={`${MAX_FILE_SIZE_MB} MB or smaller.`}
        onChange={handleFileChange}
        disabled={save.saving}
        error={fileError}
      />
      {save.state === "error" ? <SaveStatus action={save} /> : null}
      <span className="ui-visually-hidden" aria-live="polite">
        {save.saving ? words.saving : ""}
      </span>
    </Sheet>
  );
}

function SendDocumentSheet({
  document,
  subcontractors,
  loadingSubcontractors,
  onClose,
}: {
  document: CwDocument | null;
  subcontractors: SubcontractorOption[];
  loadingSubcontractors: boolean;
  onClose: () => void;
}) {
  // Keyed by document so every opening starts with empty choices.
  return (
    <SendDocumentForm
      key={document?.id ?? "closed"}
      document={document}
      subcontractors={subcontractors}
      loadingSubcontractors={loadingSubcontractors}
      onClose={onClose}
    />
  );
}

function SendDocumentForm({
  document,
  subcontractors,
  loadingSubcontractors,
  onClose,
}: {
  document: CwDocument | null;
  subcontractors: SubcontractorOption[];
  loadingSubcontractors: boolean;
  onClose: () => void;
}) {
  const [subcontractorId, setSubcontractorId] = useState("");
  const [note, setNote] = useState("");
  const [sentByName, setSentByName] = useState(getStoredAdminName);
  const [pickError, setPickError] = useState("");

  const send = useSaveAction(
    async (documentId: string, subId: string, noteText: string, sentBy: string) => {
      await api(
        "/api/documents/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId,
            subcontractorId: subId,
            note: noteText || undefined,
            sentBy: sentBy || undefined,
          }),
        },
        "The document was not sent."
      );
    },
    { savedMessage: "Document sent", onSaved: onClose }
  );

  function handleSentByChange(value: string) {
    setSentByName(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cwAdminName", value);
    }
  }

  function handleSend() {
    if (!document) return;
    if (!subcontractorId) {
      setPickError("Pick who gets this document.");
      return;
    }
    setPickError("");
    void send.run(document.id, subcontractorId, note.trim(), sentByName.trim());
  }

  const options = useMemo(
    () =>
      subcontractors.map((s) => ({
        id: s.id,
        name: s.label,
        detail: s.email ? undefined : "no email on file",
      })),
    [subcontractors]
  );

  return (
    <Sheet
      open={document !== null}
      title={document ? `Send “${document.name}”` : "Send"}
      text="Emails the file to the subcontractor you pick."
      onClose={onClose}
      busy={send.saving}
      actions={
        <BigButton busy={send.saving} busyLabel="Sending…" onClick={handleSend}>
          {LABELS.send}
        </BigButton>
      }
    >
      <Field
        label="Your name"
        hint="Saved in this document’s send history."
        value={sentByName}
        onChange={(event) => handleSentByChange(event.target.value)}
        disabled={send.saving}
        optional
      />
      {loadingSubcontractors ? (
        <SkeletonList rows={2} />
      ) : (
        <PersonPicker
          label="Subcontractor"
          searchLabel="Search subcontractors"
          emptyText="No subcontractors found."
          options={options}
          value={subcontractorId}
          onChange={(id) => {
            setSubcontractorId(id);
            setPickError("");
          }}
        />
      )}
      {pickError ? <ErrorBox title={pickError} /> : null}
      <TextAreaField
        label="Note"
        optional
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        disabled={send.saving}
        placeholder="Add a short message"
      />
      {send.state === "error" ? <SaveStatus action={send} /> : null}
    </Sheet>
  );
}

function SendHistorySheet({ document, onClose }: { document: CwDocument | null; onClose: () => void }) {
  return (
    <Sheet open={document !== null} title={document ? `Who got “${document.name}”` : "Send history"} onClose={onClose}>
      {document ? <SendHistoryList documentId={document.id} /> : null}
    </Sheet>
  );
}

function SendHistoryList({ documentId }: { documentId: string }) {
  const [sends, setSends] = useState<DocumentSend[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ success?: boolean; sends?: DocumentSend[]; error?: string }>(
      `/api/documents/send?documentId=${encodeURIComponent(documentId)}`,
      { cache: "no-store" },
      "We could not load the send history."
    )
      .then((data) => {
        if (cancelled) return;
        setError("");
        setSends(Array.isArray(data.sends) ? data.sends : []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "We could not load the send history.");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, attempt]);

  if (error) {
    return (
      <ErrorBox
        title="We could not load the send history."
        text={error}
        onRetry={() => {
          setError("");
          setSends(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (sends === null) return <SkeletonList rows={2} />;
  if (sends.length === 0) {
    return <EmptyState title="Not sent yet" text="This document has not been sent to a subcontractor." />;
  }
  return (
    <ul className="ui-list-plain" aria-label="Send history">
      {sends.map((send) => (
        <li key={send.id}>
          <p className="ui-strong">{send.subcontractorName}</p>
          <p className="ui-muted">
            {formatDateTime(send.sentAt)}
            {send.sentBy ? ` · sent by ${send.sentBy}` : ""}
          </p>
          {send.note ? <p className="ui-muted">“{send.note}”</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<CwDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<"All" | Category>("All");
  const [query, setQuery] = useState("");

  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([]);
  const [loadingSubcontractors, setLoadingSubcontractors] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sendingDocument, setSendingDocument] = useState<CwDocument | null>(null);
  const [historyDocument, setHistoryDocument] = useState<CwDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<CwDocument | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await api<{ success?: boolean; documents?: CwDocument[]; error?: string }>(
        "/api/documents",
        { cache: "no-store" },
        "We could not load the documents."
      );
      setLoadError("");
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We could not load the documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    // Same source as the Subcontractor dropdown in app/accounts/new/page.tsx
    // and Sub Center — GET /api/subcontractors. Failing to load shouldn't
    // block the document list itself, only the send sheet.
    async function loadSubcontractors() {
      try {
        const response = await fetch("/api/subcontractors", { cache: "no-store" });
        const data = (await response.json()) as {
          success?: boolean;
          subcontractors?: RawSubcontractor[];
        };

        if (!data.success || !Array.isArray(data.subcontractors)) return;

        const options = data.subcontractors
          .map((sub) => ({
            id: sub.id,
            label: subcontractorLabel(sub),
            email: sub.email?.trim() ?? "",
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        setSubcontractors(options);
      } catch {
        // Silent — the send sheet shows "No subcontractors found" instead.
      } finally {
        setLoadingSubcontractors(false);
      }
    }

    void loadSubcontractors();
  }, []);

  const remove = useSaveAction(
    async (id: string) => {
      await api(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" }, "The document was not deleted.");
      await loadDocuments();
    },
    { savedMessage: "Document deleted", onSaved: () => setDeletingDocument(null) }
  );

  const shownDocuments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter(
      (d) =>
        (filter === "All" || d.category === filter) &&
        (!q || `${d.name} ${d.fileName}`.toLowerCase().includes(q))
    );
  }, [documents, filter, query]);

  const details = (document: CwDocument) =>
    [document.category, formatFileSize(document.fileSize), document.uploadedAt ? `Added ${formatDate(document.uploadedAt)}` : ""]
      .filter(Boolean)
      .join(" · ");

  const actions = (document: CwDocument) => (
    <div className="ui-actions-row">
      <a href={document.fileUrl} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-second">
        {LABELS.open}
      </a>
      <BigButton kind="second" onClick={() => setSendingDocument(document)}>
        Send to sub
      </BigButton>
      <MoreMenu
        items={[
          { label: "Send history", icon: "clock", onSelect: () => setHistoryDocument(document) },
          { label: LABELS.delete, icon: "close", danger: true, onSelect: () => setDeletingDocument(document) },
        ]}
      />
    </div>
  );

  const countText = loading ? "" : `${documents.length} ${documents.length === 1 ? "document" : "documents"}`;

  return (
    <Screen
      title="Documents"
      subtitle={["Contracts, handbooks and policies", countText].filter(Boolean).join(" · ")}
      action={
        <BigButton icon="plus" onClick={() => setAdding(true)}>
          Add document
        </BigButton>
      }
    >
      <SearchBar value={query} onChange={setQuery} label="Search documents" />
      <Tabs
        label="Category"
        value={filter}
        onChange={setFilter}
        tabs={(["All", ...CATEGORIES] as const).map((c) => ({ value: c, label: c }))}
      />

      {remove.state === "error" ? <SaveStatus action={remove} /> : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadError ? (
        <ErrorBox
          title="We could not load the documents."
          text={loadError}
          onRetry={() => {
            setLoading(true);
            void loadDocuments();
          }}
        />
      ) : shownDocuments.length === 0 ? (
        documents.length === 0 ? (
          <EmptyState
            title="No documents yet"
            text="Add your first contract, handbook or policy."
            action={
              <BigButton kind="second" icon="plus" onClick={() => setAdding(true)}>
                Add document
              </BigButton>
            }
          />
        ) : (
          <EmptyState
            title="No documents match"
            text="Try a shorter search, or show all categories."
            action={
              <BigButton
                kind="second"
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
              >
                Show all
              </BigButton>
            }
          />
        )
      ) : (
        <CardList
          label="Documents"
          items={shownDocuments}
          getKey={(document) => document.id}
          renderCard={(document) => (
            <Card title={document.name}>
              <p className="ui-card-text">{document.fileName}</p>
              <p className="ui-card-text">{details(document)}</p>
              <div style={{ marginTop: 12 }}>{actions(document)}</div>
            </Card>
          )}
          columns={[
            {
              header: "Name",
              cell: (document) => (
                <>
                  <p className="ui-strong">{document.name}</p>
                  <p className="ui-muted">{document.fileName}</p>
                </>
              ),
            },
            { header: "Category", cell: (document) => document.category },
            { header: "Size", cell: (document) => formatFileSize(document.fileSize) || "Not known" },
            { header: "Added", cell: (document) => formatDate(document.uploadedAt) || "Not known" },
            { header: "Action", cell: actions },
          ]}
        />
      )}

      <AddDocumentSheet open={adding} onClose={() => setAdding(false)} onAdded={loadDocuments} />

      <SendDocumentSheet
        document={sendingDocument}
        subcontractors={subcontractors}
        loadingSubcontractors={loadingSubcontractors}
        onClose={() => setSendingDocument(null)}
      />

      <SendHistorySheet document={historyDocument} onClose={() => setHistoryDocument(null)} />

      <ConfirmSheet
        open={deletingDocument !== null}
        title={deletingDocument ? `Delete “${deletingDocument.name}”?` : "Delete?"}
        text="This deletes the file for everyone. It cannot be brought back. The list of who it was sent to stays."
        confirmLabel="Delete document"
        busy={remove.saving}
        busyLabel="Deleting…"
        onConfirm={() => {
          // On failure the sheet closes so the red box with "Try again" shows on the page.
          if (deletingDocument) {
            void remove.run(deletingDocument.id).then((ok) => {
              if (!ok) setDeletingDocument(null);
            });
          }
        }}
        onCancel={() => {
          setDeletingDocument(null);
          remove.reset();
        }}
      />
    </Screen>
  );
}
