"use client";

// "Upload my insurance" in the sub portal: one big green button, then a photo
// or a PDF and the expiration date. It goes to the office for approval; until
// the office approves it the old date stays. A banner says when the insurance
// expires soon, expired, is missing, is being checked, or was rejected (with
// the office's reason). English, Spanish, Portuguese (lib/subInsurance.ts).
// Shows nothing while Settings -> Reminders & check-ins has it off.
// Server: app/api/subcontractor-portal/insurance.

import { useCallback, useEffect, useState } from "react";
import type { UiLang } from "@/app/ui/words";
import { prepareDocOrPhoto } from "@/lib/imageResize";
import { photoProblemWords } from "@/lib/photoProblemWords";
import { INSURANCE_LOCALE, SUB_INSURANCE_WORDS, niceDay, type InsuranceState } from "@/lib/subInsurance";

type Status = { on: boolean; expiresOn?: string; state?: InsuranceState; waiting?: boolean; rejectedReason?: string };

const BANNER: Record<"red" | "yellow" | "blue", { background: string; border: string; color: string }> = {
  red: { background: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  yellow: { background: "#fefce8", border: "#fde68a", color: "#854d0e" },
  blue: { background: "#eff6ff", border: "#bfdbfe", color: "#1e3a8a" },
};

export default function SubInsurance({ lang }: { lang: UiLang }) {
  const w = SUB_INSURANCE_WORDS[lang] ?? SUB_INSURANCE_WORDS.en;
  const locale = INSURANCE_LOCALE[lang] ?? "en-US";
  const [status, setStatus] = useState<Status>({ on: false });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/subcontractor-portal/insurance", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean } & Status;
      setStatus(data.success && data.on ? data : { on: false });
    } catch {
      setStatus({ on: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!status.on) return null;

  async function send() {
    if (!file) return setError(w.pickFile);
    if (!day) return setError(w.pickDate);
    setBusy(true);
    setError("");
    try {
      // A photo is made small here, a PDF goes as it is; a full-size original is never sent (Vercel takes up to 4.5 MB).
      const prepared = await prepareDocOrPhoto(file);
      if (!prepared.ok) {
        setError(photoProblemWords(lang, prepared.problem));
        return;
      }
      const form = new FormData();
      form.set("file", prepared.file.type === "image/jpeg" ? new File([prepared.file], "insurance.jpg", { type: "image/jpeg" }) : prepared.file);
      form.set("expiresOn", day);
      const response = await fetch("/api/subcontractor-portal/insurance", { method: "POST", body: form });
      if (response.status === 413) {
        setError(photoProblemWords(lang, "tooBig"));
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { success?: boolean } & Status;
      if (!data.success) throw new Error();
      setStatus({ ...data, on: true });
      setSent(true);
      setOpen(false);
      setFile(null);
      setDay("");
    } catch {
      setError(w.failed);
    } finally {
      setBusy(false);
    }
  }

  const when = status.expiresOn ? niceDay(status.expiresOn, locale) : "";
  const banner: { tone: keyof typeof BANNER; text: string } | null = sent
    ? { tone: "blue", text: w.sent }
    : status.waiting
      ? { tone: "blue", text: w.waiting }
      : status.rejectedReason
        ? { tone: "red", text: w.rejected(status.rejectedReason) }
        : status.state === "expired"
          ? { tone: "red", text: w.expiredBanner(when) }
          : status.state === "soon"
            ? { tone: "yellow", text: w.soonBanner(when) }
            : status.state === "none"
              ? { tone: "yellow", text: w.noneBanner }
              : null;

  return (
    <section className="ui-stack" aria-label={w.title} style={{ marginBottom: 12 }}>
      {banner ? (
        <p role="status" style={{ ...BANNER[banner.tone], borderWidth: 2, borderStyle: "solid", borderRadius: 14, padding: "12px 14px", fontSize: 17, fontWeight: 700, margin: 0 }}>
          {banner.text}
        </p>
      ) : status.state === "ok" && when ? (
        <p className="ui-muted">{w.okLine(when)}</p>
      ) : null}

      {open ? (
        <div className="ui-stack">
          <label className="ui-btn ui-btn-second" style={{ minHeight: 64, fontSize: 18, cursor: "pointer" }}>
            📷 {file ? file.name : w.photoOrPdf}
            <input type="file" accept="application/pdf,image/*" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="ui-field">
            <span className="ui-label">{w.expires}</span>
            <input className="ui-input" type="date" value={day} onChange={(event) => setDay(event.target.value)} style={{ minHeight: 56, fontSize: 18 }} />
          </label>
          {error ? <p className="ui-field-error">{error}</p> : null}
          <button type="button" className="ui-btn ui-btn-main" style={{ minHeight: 64, fontSize: 20, background: "#15803d" }} disabled={busy} onClick={() => void send()}>
            {busy ? w.sending : w.send}
          </button>
          <button type="button" className="ui-btn ui-btn-second" disabled={busy} onClick={() => setOpen(false)}>
            {w.cancel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ui-btn ui-btn-main"
          style={{ minHeight: 64, fontSize: 20, background: "#15803d" }}
          onClick={() => {
            setSent(false);
            setError("");
            setOpen(true);
          }}
        >
          🛡️ {w.upload}
        </button>
      )}
    </section>
  );
}
