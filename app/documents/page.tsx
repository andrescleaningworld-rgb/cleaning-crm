"use client";

import { useEffect, useMemo, useState } from "react";

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
const MAX_FILE_SIZE_MB = 10;

// Same self-declared identity used by app/sub-schedules/page.tsx
// ("cwAdminName") — there's no per-manager login in this app, so admin
// actions are attributed to whatever name staff last typed in, shared via
// localStorage across pages.
function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "Contract":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "Handbook":
      return "border-purple-200 bg-purple-100 text-purple-800";
    case "Policy":
      return "border-amber-200 bg-amber-100 text-amber-800";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700";
  }
}

function UploadForm({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Contract");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");

    if (selected && selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File must be ${MAX_FILE_SIZE_MB}MB or smaller.`);
      event.target.value = "";
      setFile(null);
      return;
    }

    setFile(selected);
  }

  async function handleUpload() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", trimmedName);
      formData.append("category", category);

      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!data.success) {
        setError(data.error || "Failed to upload document.");
        return;
      }

      setName("");
      setFile(null);
      const fileInput = document.getElementById("document-file-input") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      await onUploaded();
    } catch {
      setError("Network error uploading document.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">Upload Document</h2>
        <p className="mt-1 text-sm text-gray-600">
          Store subcontractor contracts, handbooks, and policies for staff reference.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-gray-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. 2026 Subcontractor Agreement"
            disabled={uploading}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700">Category</label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
            disabled={uploading}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-gray-700">File</label>
          <input
            id="document-file-input"
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-gray-500">Max {MAX_FILE_SIZE_MB}MB.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading}
        className="mt-4 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? "Uploading..." : "Upload Document"}
      </button>
    </section>
  );
}

function DocumentRow({
  document,
  onDeleted,
  onSend,
  onHistory,
}: {
  document: CwDocument;
  onDeleted: () => Promise<void>;
  onSend: (document: CwDocument) => void;
  onHistory: (document: CwDocument) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!window.confirm(`Delete "${document.name}"? This cannot be undone.`)) return;

    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/documents?id=${encodeURIComponent(document.id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!data.success) {
        setError(data.error || "Failed to delete document.");
        setDeleting(false);
        return;
      }

      await onDeleted();
    } catch {
      setError("Network error deleting document.");
      setDeleting(false);
    }
  }

  return (
    <tr className="border-b">
      <td className="px-4 py-3">
        <p className="font-semibold text-gray-900">{document.name}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{document.fileName}</p>
        {error ? <p className="mt-1 text-xs font-semibold text-red-700">{error}</p> : null}
      </td>

      <td className="px-4 py-3">
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${categoryBadgeClass(document.category)}`}>
          {document.category}
        </span>
      </td>

      <td className="px-4 py-3 text-gray-700">{formatFileSize(document.fileSize)}</td>

      <td className="px-4 py-3 text-gray-700">{formatDate(document.uploadedAt)}</td>

      <td className="px-4 py-3">
        <div className="flex gap-3">
          <a
            href={document.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-700 hover:underline"
          >
            View
          </a>
          <button
            type="button"
            onClick={() => onSend(document)}
            className="font-semibold text-blue-700 hover:underline"
          >
            Send to Sub
          </button>
          <button
            type="button"
            onClick={() => onHistory(document)}
            className="font-semibold text-gray-700 hover:underline"
          >
            History
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "..." : "Delete"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function SendDocumentModal({
  document,
  subcontractors,
  loadingSubcontractors,
  onClose,
}: {
  document: CwDocument;
  subcontractors: SubcontractorOption[];
  loadingSubcontractors: boolean;
  onClose: () => void;
}) {
  const [subcontractorId, setSubcontractorId] = useState("");
  const [note, setNote] = useState("");
  const [sentByName, setSentByName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSentByName(getStoredAdminName());
  }, []);

  function handleSentByChange(value: string) {
    setSentByName(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cwAdminName", value);
    }
  }

  async function handleSend() {
    if (!subcontractorId) {
      setError("Choose a subcontractor.");
      return;
    }

    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/documents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          subcontractorId,
          note: note.trim() || undefined,
          sentBy: sentByName.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!data.success) {
        setError(data.error || "Failed to send document.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error sending document.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900">Send &quot;{document.name}&quot;</h3>
        <p className="mt-1 text-sm text-gray-600">
          Emails the file as an attachment to the selected subcontractor.
        </p>

        {success ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800">
            Document sent.
          </div>
        ) : (
          <>
            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-4">
              <label className="text-sm font-semibold text-gray-700">Your Name</label>
              <input
                type="text"
                value={sentByName}
                onChange={(event) => handleSentByChange(event.target.value)}
                placeholder="Enter your name"
                disabled={sending}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              />
              <p className="mt-1 text-xs text-gray-500">Recorded in this document&apos;s send history.</p>
            </div>

            <div className="mt-3">
              <label className="text-sm font-semibold text-gray-700">Subcontractor</label>
              <select
                value={subcontractorId}
                onChange={(event) => setSubcontractorId(event.target.value)}
                disabled={sending || loadingSubcontractors}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              >
                <option value="">
                  {loadingSubcontractors ? "Loading subcontractors..." : "Select subcontractor"}
                </option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {!s.email ? " (no email on file)" : ""}
                  </option>
                ))}
              </select>
              {!loadingSubcontractors && subcontractors.length === 0 ? (
                <p className="mt-1 text-xs text-gray-500">No subcontractors found.</p>
              ) : null}
            </div>

            <div className="mt-3">
              <label className="text-sm font-semibold text-gray-700">Note (optional)</label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                disabled={sending}
                placeholder="Add a short message..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              />
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {success ? "Close" : "Cancel"}
          </button>
          {!success ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SendHistoryModal({
  document,
  onClose,
}: {
  document: CwDocument;
  onClose: () => void;
}) {
  const [sends, setSends] = useState<DocumentSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSends() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/documents/send?documentId=${encodeURIComponent(document.id)}`,
          { cache: "no-store" }
        );
        const data = (await response.json()) as { success?: boolean; sends?: DocumentSend[]; error?: string };

        if (cancelled) return;
        if (!data.success || !Array.isArray(data.sends)) {
          setError(data.error || "Failed to load send history.");
          return;
        }
        setSends(data.sends);
      } catch {
        if (!cancelled) setError("Network error loading send history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSends();
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900">Send History — &quot;{document.name}&quot;</h3>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 p-6 text-center text-sm text-gray-600">Loading...</div>
        ) : (
          <div className="mt-4 max-h-96 overflow-y-auto">
            {sends.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-600">
                This document hasn&apos;t been sent to a subcontractor yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {sends.map((send) => (
                  <li key={send.id} className="py-3 text-sm">
                    <p className="font-semibold text-gray-900">{send.subcontractorName}</p>
                    <p className="mt-0.5 text-gray-600">
                      {formatDateTime(send.sentAt)}
                      {send.sentBy ? ` — sent by ${send.sentBy}` : ""}
                    </p>
                    {send.note ? (
                      <p className="mt-1 text-gray-500 italic">&quot;{send.note}&quot;</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function subcontractorLabel(sub: RawSubcontractor): string {
  return sub.contactName?.trim() || sub.companyName?.trim() || sub.email?.trim() || "Unnamed subcontractor";
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<CwDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<"All" | (typeof CATEGORIES)[number]>("All");

  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([]);
  const [loadingSubcontractors, setLoadingSubcontractors] = useState(true);
  const [sendingDocument, setSendingDocument] = useState<CwDocument | null>(null);
  const [historyDocument, setHistoryDocument] = useState<CwDocument | null>(null);

  async function loadDocuments() {
    setLoadError("");
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; documents?: CwDocument[]; error?: string };

      if (!data.success || !Array.isArray(data.documents)) {
        setLoadError(data.error || "Failed to load documents.");
        return;
      }

      setDocuments(data.documents);
    } catch {
      setLoadError("Network error loading documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    // Same source as the Subcontractor dropdown in app/accounts/new/page.tsx
    // and Sub Center — GET /api/subcontractors. Failing to load shouldn't
    // block the document list itself, only the send modal.
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
        // Silent — the send modal shows "No subcontractors found" instead.
      } finally {
        setLoadingSubcontractors(false);
      }
    }

    loadSubcontractors();
  }, []);

  const filteredDocuments = useMemo(
    () => (filter === "All" ? documents : documents.filter((d) => d.category === filter)),
    [documents, filter]
  );

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
            <p className="mt-1 text-gray-600">
              Company documents — subcontractor contracts, handbooks, and policies.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-gray-500">Total Documents</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{documents.length}</p>
          </div>
        </div>

        <div className="grid gap-6">
          <UploadForm onUploaded={loadDocuments} />

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">All Documents</h2>

              <div className="flex flex-wrap gap-2">
                {(["All", ...CATEGORIES] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFilter(c)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      filter === c
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {loadError ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {loadError}
              </div>
            ) : null}

            {loading ? (
              <div className="p-6 text-center text-gray-600">Loading documents...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Size</th>
                      <th className="px-4 py-3 font-semibold">Uploaded</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredDocuments.map((document) => (
                      <DocumentRow
                        key={document.id}
                        document={document}
                        onDeleted={loadDocuments}
                        onSend={setSendingDocument}
                        onHistory={setHistoryDocument}
                      />
                    ))}
                  </tbody>
                </table>

                {filteredDocuments.length === 0 && (
                  <div className="p-6 text-center text-gray-600">
                    {documents.length === 0 ? "No documents yet — upload one above." : "No documents in this category."}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {sendingDocument ? (
        <SendDocumentModal
          document={sendingDocument}
          subcontractors={subcontractors}
          loadingSubcontractors={loadingSubcontractors}
          onClose={() => setSendingDocument(null)}
        />
      ) : null}

      {historyDocument ? (
        <SendHistoryModal document={historyDocument} onClose={() => setHistoryDocument(null)} />
      ) : null}
    </main>
  );
}
