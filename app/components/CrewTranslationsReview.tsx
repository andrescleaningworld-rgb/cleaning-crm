"use client";

// Account page → Crew Link → "Review translations": every tab name, section
// and item on this account's checklist, English first (managers always read
// English), with the Spanish and Portuguese crews see. Editing a box and
// leaving it saves a correction that overrides the automatic translation;
// clearing it goes back to the automatic one. Corrections are keyed by the
// English text, so they apply to every account using that exact wording.
import { useCallback, useState } from "react";
import type { TranslationReviewRow } from "@/lib/crewTranslations";

type Lang = "es" | "pt";

function Cell({ row, lang, onSaved }: { row: TranslationReviewRow; lang: Lang; onSaved: () => void }) {
  const current = row[lang].manual ?? row[lang].auto ?? "";
  const [value, setValue] = useState(current);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const corrected = row[lang].manual !== null;

  async function save() {
    const next = value.trim();
    // Unchanged, or typed back exactly the automatic text with no correction yet.
    if (next === current.trim() || (!corrected && next === (row[lang].auto ?? "").trim())) return;
    setState("saving");
    try {
      const res = await fetch("/api/admin/crew-translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: row.text, lang, value: next }),
      });
      const data = (await res.json()) as { success?: boolean };
      setState(data.success ? "saved" : "error");
      if (data.success) {
        // Cleared → back to showing the automatic translation.
        if (!next) setValue(row[lang].auto ?? "");
        onSaved();
      }
    } catch {
      setState("error");
    }
  }

  return (
    <td className="px-2 py-2 align-top">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={save}
        rows={1}
        placeholder={row[lang].auto === null ? "Not translated yet (crews see English)" : ""}
        className={`w-full min-w-[180px] resize-y rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-blue-500 ${
          corrected ? "border-blue-300 bg-blue-50" : "border-slate-200"
        }`}
      />
      <span className="text-[11px] font-semibold text-slate-400">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Could not save" : corrected ? "Corrected" : row[lang].auto ? "Automatic" : ""}
      </span>
    </td>
  );
}

export default function CrewTranslationsReview({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TranslationReviewRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/admin/crew-translations?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = (await res.json()) as { success?: boolean; rows?: TranslationReviewRow[]; error?: string };
      if (data.success) setRows(data.rows ?? []);
      else setError(data.error || "Could not load translations.");
    } catch {
      setError("Could not load translations.");
    }
  }, [accountId]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          load();
        }}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
      >
        🌐 Review translations (ES / PT)
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Crew translations</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold text-slate-500 hover:underline">
          Close
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Crews see these in the language their phone picks. Edit a box to correct it — your wording replaces the automatic one
        everywhere this exact English text is used. Clear a box to go back to the automatic translation. New items are
        translated a few seconds after saving.
      </p>
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      {rows === null && !error ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {rows && rows.length === 0 ? <p className="text-sm text-slate-500">No checklist items yet.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-xs text-slate-500">
                <th className="px-2 py-2 font-bold">English</th>
                <th className="px-2 py-2 font-bold">Español</th>
                <th className="px-2 py-2 font-bold">Português</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.text} className="border-b border-slate-100">
                  <td className="px-2 py-2 align-top font-semibold text-slate-900">{row.text}</td>
                  <Cell row={row} lang="es" onSaved={load} />
                  <Cell row={row} lang="pt" onSaved={load} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
