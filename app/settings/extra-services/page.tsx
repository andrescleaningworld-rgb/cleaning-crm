"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  LABELS,
  SaveStatus,
  Screen,
  Sheet,
  SkeletonList,
  StatusPill,
  TextAreaField,
  useSaveAction,
} from "@/app/ui";

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

// Shared by the add and change forms — uploads as soon as a file is picked
// and hands the resulting Blob URL back to the caller, rather than deferring
// the upload to the form's save.
async function uploadServiceImage(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Pick a JPEG, PNG, WebP or GIF picture.");
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    throw new Error(`That picture is too big. Pick one that is ${MAX_IMAGE_SIZE_MB} MB or smaller.`);
  }
  const formData = new FormData();
  formData.append("file", file);
  const data = await api<{ success?: boolean; url?: string; error?: string }>(
    "/api/extra-services/upload",
    { method: "POST", body: formData },
    "The picture did not upload."
  );
  if (!data.url) throw new Error("The picture did not upload.");
  return data.url;
}

function ServiceThumb({ imageUrl, size }: { imageUrl: string; size: number }) {
  const style = { width: size, height: size, flex: "0 0 auto" } as const;
  return imageUrl ? (
    <div className="ui-photo" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local asset */}
      <img src={imageUrl} alt="" />
    </div>
  ) : (
    <div className="ui-photo ui-thumb-empty" style={style}>
      <span className="ui-hint">No picture</span>
    </div>
  );
}

function ServiceImagePicker({
  imageUrl,
  onImageUrlChange,
  onUploadingChange,
  disabled,
}: {
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError("");
    setUploading(true);
    onUploadingChange(true);
    try {
      onImageUrlChange(await uploadServiceImage(file));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "The picture did not upload.");
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  }

  return (
    <div className="ui-field" role="group" aria-label="Picture">
      <span className="ui-label">
        Picture <span className="ui-optional">(optional)</span>
      </span>
      <div className="ui-actions-row">
        <ServiceThumb imageUrl={imageUrl} size={88} />
        <BigButton
          kind="second"
          icon="camera"
          busy={uploading}
          busyLabel="Uploading…"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {imageUrl ? "Change picture" : "Add picture"}
        </BigButton>
        {imageUrl && !uploading ? (
          <BigButton kind="quiet" disabled={disabled} onClick={() => onImageUrlChange("")}>
            Remove picture
          </BigButton>
        ) : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
      {uploadError ? (
        <span className="ui-field-error" role="alert">
          {uploadError}
        </span>
      ) : null}
    </div>
  );
}

// One form for both adding (service = null) and changing a service.
function ServiceForm({
  service,
  onClose,
  onSaved,
}: {
  service: ExtraService | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ServiceDraft>(
    service
      ? {
          name: service.name,
          description: service.description,
          imageUrl: service.imageUrl,
          sortOrder: String(service.sortOrder),
        }
      : emptyDraft
  );
  const [nameError, setNameError] = useState("");
  const [uploading, setUploading] = useState(false);

  const save = useSaveAction(
    async (name: string, current: ServiceDraft) => {
      if (service) {
        await api(
          `/api/extra-services/${service.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              description: current.description.trim(),
              imageUrl: current.imageUrl,
              sortOrder: draftToNumber(current.sortOrder),
            }),
          },
          "Your changes were not saved."
        );
      } else {
        await api(
          "/api/extra-services",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              description: current.description.trim(),
              imageUrl: current.imageUrl,
              active: true,
              sortOrder: draftToNumber(current.sortOrder),
            }),
          },
          "The service was not added."
        );
      }
      await onSaved();
    },
    { savedMessage: service ? "Saved" : "Service added", onSaved: onClose }
  );

  function handleSave() {
    const name = draft.name.trim();
    if (!name) {
      setNameError("Type a name for this service.");
      return;
    }
    setNameError("");
    void save.run(name, draft);
  }

  const busy = save.saving || uploading;

  return (
    <Sheet
      open
      title={service ? `Change “${service.name}”` : "Add a service"}
      text={service ? undefined : "Customers see it in the portal right away. You can hide it later."}
      onClose={onClose}
      busy={busy}
      actions={
        <BigButton busy={save.saving} busyLabel="Saving…" disabled={uploading} onClick={handleSave}>
          {service ? LABELS.save : "Add service"}
        </BigButton>
      }
    >
      <Field
        label="Name"
        value={draft.name}
        onChange={(event) => {
          setDraft((d) => ({ ...d, name: event.target.value }));
          setNameError("");
        }}
        placeholder="Window Cleaning"
        disabled={save.saving}
        error={nameError}
      />
      <TextAreaField
        label="Description"
        hint="Customers read this when they ask for the service."
        optional
        value={draft.description}
        onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
        rows={3}
        disabled={save.saving}
      />
      <ServiceImagePicker
        imageUrl={draft.imageUrl}
        onImageUrlChange={(imageUrl) => setDraft((d) => ({ ...d, imageUrl }))}
        onUploadingChange={setUploading}
        disabled={save.saving}
      />
      <Field
        label="Sort order"
        hint="Lowest number shows first. Two services can share a number."
        type="number"
        inputMode="numeric"
        optional
        value={draft.sortOrder}
        onChange={(event) => setDraft((d) => ({ ...d, sortOrder: event.target.value }))}
        disabled={save.saving}
      />
      {save.state === "error" ? <SaveStatus action={save} /> : null}
    </Sheet>
  );
}

export default function ExtraServicesSettingsPage() {
  const [services, setServices] = useState<ExtraService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // "new" = add form open; a service = change form open for it.
  const [formFor, setFormFor] = useState<ExtraService | "new" | null>(null);
  const [togglingId, setTogglingId] = useState("");

  const loadServices = useCallback(async () => {
    try {
      const data = await api<{ success?: boolean; services?: ExtraService[]; error?: string }>(
        "/api/extra-services",
        { cache: "no-store" },
        "We could not load the services."
      );
      setLoadError("");
      setServices(Array.isArray(data.services) ? data.services : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We could not load the services.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  // Hiding goes through DELETE (soft-delete, sets active=No — see
  // app/api/extra-services/[id]/route.ts); showing a hidden service again is
  // a plain field update, not an "undelete", so it goes through PATCH.
  // No "are you sure": hiding deletes nothing and one tap brings it back.
  const toggle = useSaveAction(async (service: ExtraService) => {
    setTogglingId(service.id);
    try {
      if (service.active) {
        await api(`/api/extra-services/${service.id}`, { method: "DELETE" }, "The service was not hidden.");
      } else {
        await api(
          `/api/extra-services/${service.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: true }),
          },
          "The service was not shown again."
        );
      }
      await loadServices();
    } finally {
      setTogglingId("");
    }
  });

  const activeCount = services.filter((s) => s.active).length;

  const status = (service: ExtraService) =>
    service.active ? <StatusPill kind="done">Active</StatusPill> : <StatusPill kind="off">Hidden</StatusPill>;

  const actions = (service: ExtraService) => (
    <div className="ui-actions-row">
      <BigButton kind="second" disabled={toggle.saving} onClick={() => setFormFor(service)}>
        {LABELS.edit}
      </BigButton>
      <BigButton
        kind="second"
        busy={togglingId === service.id}
        busyLabel="Saving…"
        disabled={toggle.saving}
        onClick={() => void toggle.run(service)}
      >
        {service.active ? "Hide" : "Show again"}
      </BigButton>
    </div>
  );

  return (
    <Screen
      title="Extra / Specialty Services"
      subtitle={
        loading
          ? "Services customers can ask for in the portal"
          : `Services customers can ask for in the portal · ${activeCount} active`
      }
      backHref="/settings"
      action={
        <BigButton icon="plus" onClick={() => setFormFor("new")}>
          Add service
        </BigButton>
      }
    >
      <p className="ui-muted">
        Customers see active services, lowest sort order first. Hiding a service keeps its details so you can show it
        again later.
      </p>

      {toggle.state === "error" ? <SaveStatus action={toggle} /> : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadError ? (
        <ErrorBox
          title="We could not load the services."
          text={loadError}
          onRetry={() => {
            setLoading(true);
            void loadServices();
          }}
        />
      ) : services.length === 0 ? (
        <EmptyState
          title="No services yet"
          text="Add the first specialty service customers can ask for."
          action={
            <BigButton kind="second" icon="plus" onClick={() => setFormFor("new")}>
              Add service
            </BigButton>
          }
        />
      ) : (
        <CardList
          label="Services"
          items={services}
          getKey={(service) => service.id}
          renderCard={(service) => (
            <Card>
              <div className="ui-actions-row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <ServiceThumb imageUrl={service.imageUrl} size={72} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 className="ui-card-title">{service.name}</h2>
                  {service.description ? <p className="ui-card-text ui-clamp">{service.description}</p> : null}
                  <p className="ui-card-text">Sort order {service.sortOrder}</p>
                </div>
              </div>
              <div className="ui-actions-row" style={{ marginTop: 12, justifyContent: "space-between" }}>
                {status(service)}
                {actions(service)}
              </div>
            </Card>
          )}
          columns={[
            { header: "Picture", cell: (service) => <ServiceThumb imageUrl={service.imageUrl} size={56} /> },
            {
              header: "Name",
              cell: (service) => (
                <>
                  <p className="ui-strong">{service.name}</p>
                  {service.description ? <p className="ui-muted ui-clamp">{service.description}</p> : null}
                </>
              ),
            },
            { header: "Sort order", cell: (service) => service.sortOrder },
            { header: "Status", cell: status },
            { header: "Action", cell: actions },
          ]}
        />
      )}

      {formFor ? (
        <ServiceForm
          key={formFor === "new" ? "new" : formFor.id}
          service={formFor === "new" ? null : formFor}
          onClose={() => setFormFor(null)}
          onSaved={loadServices}
        />
      ) : null}
    </Screen>
  );
}
