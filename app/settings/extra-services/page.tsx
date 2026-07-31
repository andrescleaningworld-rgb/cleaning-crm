"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ExtraService = {
  sheetRow: number;
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  active: boolean;
  sortOrder: number;
};

type ServiceDraft = {
  name: string;
  description: string;
  imageUrl: string;
  sortOrder: string; // kept as string while editing, parsed to number on save
};

const emptyDraft: ServiceDraft = {
  name: "",
  description: "",
  imageUrl: "",
  sortOrder: "0",
};

const MAX_IMAGE_SIZE_MB = 5;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function draftToNumber(sortOrder: string): number {
  const parsed = Number(sortOrder);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Shared by the "Add New Service" form and each row's inline edit form —
// uploads immediately on file selection and hands the resulting Blob URL
// back to the caller, rather than deferring the upload to form submit.
async function uploadServiceImage(
  file: File,
  onUploading: (uploading: boolean) => void,
  onError: (message: string) => void
): Promise<string | null> {
  onError("");

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    onError("Only JPEG, PNG, WebP, or GIF images are allowed.");
    return null;
  }

  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    onError(`Image must be ${MAX_IMAGE_SIZE_MB}MB or smaller.`);
    return null;
  }

  onUploading(true);
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/extra-services/upload", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as { success?: boolean; url?: string; error?: string };

    if (!data.success || !data.url) {
      onError(data.error || "Image upload failed.");
      return null;
    }

    return data.url;
  } catch {
    onError("Network error uploading image.");
    return null;
  } finally {
    onUploading(false);
  }
}

function ServiceImagePicker({
  imageUrl,
  onImageUrlChange,
  disabled,
}: {
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const url = await uploadServiceImage(file, setUploading, setUploadError);
    if (url) onImageUrlChange(url);
  }

  return (
    <div className="flex items-start gap-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local asset (see ServiceImagePicker)
        <img
          src={imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-lg border border-gray-200 object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-[10px] text-gray-400">
          No image
        </div>
      )}

      <div className="min-w-0 flex-1">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-60"
        />
        {uploading ? (
          <p className="mt-1 text-xs font-semibold text-blue-700">Uploading...</p>
        ) : null}
        {uploadError ? (
          <p className="mt-1 text-xs font-semibold text-red-700">{uploadError}</p>
        ) : null}
        {imageUrl && !uploading ? (
          <button
            type="button"
            onClick={() => onImageUrlChange("")}
            className="mt-1 text-xs font-semibold text-gray-500 hover:text-red-700 hover:underline"
          >
            Remove image
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AddServiceForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    const name = draft.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }

    setAdding(true);
    setError("");
    try {
      const response = await fetch("/api/extra-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: draft.description.trim(),
          imageUrl: draft.imageUrl,
          active: true,
          sortOrder: draftToNumber(draft.sortOrder),
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!data.success) {
        setError(data.error || "Failed to add service.");
        return;
      }

      setDraft(emptyDraft);
      await onAdded();
    } catch {
      setError("Network error adding service.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">Add New Service</h2>
        <p className="mt-1 text-sm text-gray-600">
          New services are added as active and appear at the end of the list —
          adjust Sort Order below or after adding to control display position.
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
            value={draft.name}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            placeholder="e.g. Window Cleaning"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700">Sort Order</label>
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(event) => setDraft((d) => ({ ...d, sortOrder: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-gray-700">Description</label>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
            rows={3}
            placeholder="Shown to customers when requesting this service"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-gray-700">Image</label>
          <div className="mt-1">
            <ServiceImagePicker
              imageUrl={draft.imageUrl}
              onImageUrlChange={(imageUrl) => setDraft((d) => ({ ...d, imageUrl }))}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        className="mt-4 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {adding ? "Adding..." : "Add Service"}
      </button>
    </section>
  );
}

function ServiceRow({
  service,
  onChanged,
}: {
  service: ExtraService;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ServiceDraft>({
    name: service.name,
    description: service.description,
    imageUrl: service.imageUrl,
    sortOrder: String(service.sortOrder),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setDraft({
      name: service.name,
      description: service.description,
      imageUrl: service.imageUrl,
      sortOrder: String(service.sortOrder),
    });
    setError("");
    setEditing(true);
  }

  async function saveEdit() {
    const name = draft.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/extra-services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: draft.description.trim(),
          imageUrl: draft.imageUrl,
          sortOrder: draftToNumber(draft.sortOrder),
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!data.success) {
        setError(data.error || "Failed to save changes.");
        return;
      }

      setEditing(false);
      await onChanged();
    } catch {
      setError("Network error saving changes.");
    } finally {
      setSaving(false);
    }
  }

  // Deactivate goes through DELETE (soft-delete, sets active=No — see
  // app/api/extra-services/[id]/route.ts); reactivating a hidden service
  // is a plain field update, not an "undelete", so it goes through PATCH.
  async function toggleActive() {
    setSaving(true);
    setError("");
    try {
      const response = service.active
        ? await fetch(`/api/extra-services/${service.id}`, { method: "DELETE" })
        : await fetch(`/api/extra-services/${service.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: true }),
          });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!data.success) {
        setError(data.error || "Failed to update status.");
        return;
      }

      await onChanged();
    } catch {
      setError("Network error updating status.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-b bg-blue-50/40">
        <td colSpan={5} className="px-4 py-4">
          {error ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-500">Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">Sort Order</label>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) => setDraft((d) => ({ ...d, sortOrder: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500">Description</label>
              <textarea
                value={draft.description}
                onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500">Image</label>
              <div className="mt-1">
                <ServiceImagePicker
                  imageUrl={draft.imageUrl}
                  onImageUrlChange={(imageUrl) => setDraft((d) => ({ ...d, imageUrl }))}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b ${service.active ? "" : "bg-gray-50"}`}>
      <td className="px-4 py-3">
        {service.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- see ServiceImagePicker
          <img
            src={service.imageUrl}
            alt=""
            className="h-12 w-12 rounded-lg border border-gray-200 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-gray-300 text-[9px] text-gray-400">
            No image
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <p className="font-semibold text-gray-900">{service.name}</p>
        {service.description ? (
          <p className="mt-0.5 max-w-md truncate text-xs text-gray-500">{service.description}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs font-semibold text-red-700">{error}</p> : null}
      </td>

      <td className="px-4 py-3 text-gray-700">{service.sortOrder}</td>

      <td className="px-4 py-3">
        <span
          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
            service.active
              ? "border-green-200 bg-green-100 text-green-800"
              : "border-gray-200 bg-gray-100 text-gray-600"
          }`}
        >
          {service.active ? "Active" : "Hidden"}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={startEdit}
            disabled={saving}
            className="font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={toggleActive}
            disabled={saving}
            className="font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "..." : service.active ? "Hide" : "Unhide"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ExtraServicesSettingsPage() {
  const [services, setServices] = useState<ExtraService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function loadServices() {
    setLoadError("");
    try {
      const response = await fetch("/api/extra-services", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; services?: ExtraService[]; error?: string };

      if (!data.success || !Array.isArray(data.services)) {
        setLoadError(data.error || "Failed to load services.");
        return;
      }

      setServices(data.services);
    } catch {
      setLoadError("Network error loading services.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, []);

  const activeCount = services.filter((s) => s.active).length;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/settings" className="text-sm font-semibold text-blue-700 hover:underline">
              ← Back to Settings
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Extra / Specialty Services</h1>
            <p className="mt-1 text-gray-600">
              Manage the specialty services customers can request from the portal. Hiding a
              service keeps its details for later instead of deleting them.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-gray-500">Active Services</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{activeCount}</p>
          </div>
        </div>

        <div className="grid gap-6">
          <AddServiceForm onAdded={loadServices} />

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">All Services</h2>
              <p className="mt-1 text-sm text-gray-600">
                Sorted by Sort Order, lowest first — matches the order customers will see them in.
              </p>
            </div>

            {loadError ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {loadError}
              </div>
            ) : null}

            {loading ? (
              <div className="p-6 text-center text-gray-600">Loading services...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3 font-semibold">Image</th>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Sort Order</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {services.map((service) => (
                      <ServiceRow key={service.id} service={service} onChanged={loadServices} />
                    ))}
                  </tbody>
                </table>

                {services.length === 0 && (
                  <div className="p-6 text-center text-gray-600">No services yet — add one above.</div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
