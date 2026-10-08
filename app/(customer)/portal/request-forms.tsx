"use client";

// The four things a customer can send from the new portal. Each one posts
// to the same address the portal used before (/api/portal/complaints,
// service-requests, date-changes, billing-requests), so staff get them in
// Portal Requests exactly as today. After a save the customer lands on the
// big "Sent ✓" screen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton, ErrorBox, Field, PhotoPicker, Screen, SelectField, TextAreaField } from "@/app/ui";
import { LangToggle, usePortalLang, usePortalWords } from "./portal-ui";
import { portalDay } from "./words";

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("save");
}

/** Shared frame: title, the fields, an error line, one Send button. */
function FormScreen({
  title,
  subtitle,
  busy,
  busyLabel,
  error,
  onSubmit,
  children,
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  busyLabel?: string;
  error: string;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const words = usePortalWords();
  return (
    <Screen title={title} subtitle={subtitle} backHref="/portal" headerRight={<LangToggle />}>
      <form
        className="ui-stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        {error ? <ErrorBox title={error} /> : null}
        <div className="ui-actionbar">
          <BigButton type="submit" busy={busy} busyLabel={busyLabel ?? words.sendingForm}>
            {words.send}
          </BigButton>
        </div>
      </form>
    </Screen>
  );
}

// ─── Report a problem (with photos) ──────────────────────────────────────────

const PROBLEM_KINDS = ["Missed Cleaning", "Quality Issue", "Staff Conduct", "Damaged Property", "Communication Issue", "Other"];

export function ProblemForm({ accountName }: { accountName: string }) {
  const words = usePortalWords();
  const router = useRouter();
  const [kind, setKind] = useState("");
  const [details, setDetails] = useState("");
  const [day, setDay] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!kind) return setError(words.needKind);
    if (!details.trim()) return setError(words.needDetails);
    setBusy(true);
    setError("");
    try {
      const urls: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        for (const file of photos) {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/portal/upload", { method: "POST", body: form });
          const data = (await res.json().catch(() => ({}))) as { url?: string };
          if (!res.ok || !data.url) throw new Error("upload");
          urls.push(data.url);
        }
        setUploading(false);
      }
      await post("/api/portal/complaints", { issueType: kind, description: details.trim(), incidentDate: day, photos: urls });
      router.push("/portal/sent?kind=problem");
    } catch {
      setError(words.somethingWrong);
      setUploading(false);
      setBusy(false);
    }
  }

  return (
    <FormScreen title={words.problemTitle} subtitle={accountName} busy={busy} busyLabel={uploading ? words.uploadingPhotos : undefined} error={error} onSubmit={submit}>
      <SelectField label={words.problemKind} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">{words.pickOne}</option>
        {PROBLEM_KINDS.map((k) => (
          <option key={k} value={k}>
            {words.problemKinds[k] ?? k}
          </option>
        ))}
      </SelectField>
      <TextAreaField label={words.problemDetails} value={details} onChange={(e) => setDetails(e.target.value)} rows={4} />
      <Field label={words.problemDate} optional type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <PhotoPicker label={words.photos} files={photos} onChange={setPhotos} max={6} />
    </FormScreen>
  );
}

// ─── Ask for extra service ───────────────────────────────────────────────────

export type PortalService = { id: string; name: string; description: string; imageUrl: string };

export function ServiceForm({ accountName, services }: { accountName: string; services: PortalService[] }) {
  const words = usePortalWords();
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    const names = services.filter((s) => picked.has(s.id)).map((s) => s.name);
    if (names.length === 0 && !details.trim()) return setError(words.needService);
    setBusy(true);
    setError("");
    try {
      await post("/api/portal/service-requests", { serviceRequested: names.join(", ") || "Other", details: details.trim(), preferredDate: day });
      router.push("/portal/sent?kind=service");
    } catch {
      setError(words.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <FormScreen title={words.serviceTitle} subtitle={services.length > 0 ? words.serviceText : words.noServices} busy={busy} error={error} onSubmit={submit}>
      <p className="ui-visually-hidden">{accountName}</p>
      {services.length > 0 ? (
        <div className="ui-stack" role="group" aria-label={words.serviceTitle}>
          {services.map((service) => {
            const on = picked.has(service.id);
            return (
              <button key={service.id} type="button" aria-pressed={on} className={`ui-pick ${on ? "ui-pick-on" : ""}`.trim()} onClick={() => toggle(service.id)}>
                {service.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local asset
                  <img src={service.imageUrl} alt="" className="ui-pick-img" />
                ) : (
                  <span className="ui-pick-img ui-pick-img-empty" aria-hidden="true">
                    ✨
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="ui-strong block">{service.name}</span>
                  {service.description ? <span className="ui-muted block">{service.description}</span> : null}
                </span>
                <span className="ui-pick-mark" aria-hidden="true">
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <TextAreaField label={words.serviceDetails} optional value={details} onChange={(e) => setDetails(e.target.value)} rows={3} />
      <Field label={words.serviceDate} optional type="date" value={day} onChange={(e) => setDay(e.target.value)} />
    </FormScreen>
  );
}

// ─── Change a date ───────────────────────────────────────────────────────────

export function DateForm({ accountName, upcoming }: { accountName: string; upcoming: { date: string; timeWindow: string }[] }) {
  const words = usePortalWords();
  const lang = usePortalLang();
  const router = useRouter();
  const [which, setWhich] = useState(upcoming[0]?.date ?? "other");
  const [otherDay, setOtherDay] = useState("");
  const [newDay, setNewDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const currentDate = which === "other" ? otherDay : which;
    if (!currentDate || !newDay) return setError(words.needDates);
    setBusy(true);
    setError("");
    try {
      await post("/api/portal/date-changes", { currentDate, requestedDate: newDay, reason: reason.trim() });
      router.push("/portal/sent?kind=date");
    } catch {
      setError(words.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <FormScreen title={words.dateTitle} subtitle={accountName} busy={busy} error={error} onSubmit={submit}>
      {upcoming.length > 0 ? (
        <SelectField label={words.dateWhich} value={which} onChange={(e) => setWhich(e.target.value)}>
          {upcoming.map((c) => (
            <option key={c.date} value={c.date}>
              {portalDay(c.date, lang)} · {words.windows[c.timeWindow] ?? c.timeWindow}
            </option>
          ))}
          <option value="other">{words.dateOther}</option>
        </SelectField>
      ) : null}
      {which === "other" || upcoming.length === 0 ? (
        <Field label={words.dateCurrent} type="date" value={otherDay} onChange={(e) => setOtherDay(e.target.value)} />
      ) : null}
      <Field label={words.dateNew} type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
      <TextAreaField label={words.dateReason} optional value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
    </FormScreen>
  );
}

// ─── Billing question ────────────────────────────────────────────────────────

const BILLING_KINDS = ["Invoice Copy", "Payment Question", "Update Billing Information", "Billing Dispute", "Payment Confirmation", "Other"];

export function BillingForm({ accountName }: { accountName: string }) {
  const words = usePortalWords();
  const router = useRouter();
  const [kind, setKind] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!kind) return setError(words.needBillingKind);
    setBusy(true);
    setError("");
    try {
      await post("/api/portal/billing-requests", { requestType: kind, details: details.trim() });
      router.push("/portal/sent?kind=billing");
    } catch {
      setError(words.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <FormScreen title={words.billingTitle} subtitle={accountName} busy={busy} error={error} onSubmit={submit}>
      <SelectField label={words.billingKind} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">{words.pickOne}</option>
        {BILLING_KINDS.map((k) => (
          <option key={k} value={k}>
            {words.billingKinds[k] ?? k}
          </option>
        ))}
      </SelectField>
      <TextAreaField label={words.billingDetails} optional value={details} onChange={(e) => setDetails(e.target.value)} rows={4} />
    </FormScreen>
  );
}
