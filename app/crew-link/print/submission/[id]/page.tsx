"use client";

// Printable COMPLETED checklist submission: what the crew checked, who filled
// it out, date/time, notes and the tab name. Same data and time helpers as
// the staff submissions screen and the PDF report (lib/pdf/porter-checklist-report.tsx).
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { describeWorkTimes, type ChecklistSubmissionSection } from "@/lib/checklistTemplate";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import CrewPrintSheet, { PrintBox, PrintFact } from "../../CrewPrintSheet";

type SubmissionDetail = {
  id: number;
  accountName: string;
  porterName: string;
  timeIn: string;
  timeOut: string;
  completedCount: number;
  totalCount: number;
  generalNotes: string;
  generalNotesEnglish: string | null;
  submittedAt: string;
  tabName: string | null;
  startedAt: string | null;
  sections: ChecklistSubmissionSection[];
};

type DetailResponse = { success?: boolean; error?: string; detail?: SubmissionDetail };

export default function CrewLinkPrintSubmissionPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/checklist-submissions?id=${id}`, { cache: "no-store" });
        const data = (await res.json()) as DetailResponse;
        if (!res.ok || data.success === false || !data.detail) throw new Error(data.error || "Could not load this checklist.");
        if (!cancelled) setDetail(data.detail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this checklist.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <p className="p-8 text-center text-lg font-semibold text-red-700">{error}</p>;
  }
  if (!detail) {
    return <p className="p-8 text-center text-lg text-slate-500">Loading checklist…</p>;
  }

  const times = describeWorkTimes(detail);
  const notesEnglish =
    detail.generalNotesEnglish && detail.generalNotesEnglish.trim() !== detail.generalNotes.trim() ? detail.generalNotesEnglish : "";

  return (
    <CrewPrintSheet accountName={detail.accountName} title={`${detail.tabName || "Checklist"} — Completed`}>
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
        <PrintFact label="Filled out by" value={detail.porterName} />
        <PrintFact label="Sent" value={formatCrewDateTime(detail.submittedAt)} />
        <PrintFact label={times.startLabel} value={times.start} />
        <PrintFact label={times.endLabel} value={times.end} />
        <PrintFact label="Done" value={`${detail.completedCount} of ${detail.totalCount}`} />
      </div>

      {detail.sections.map((section) => (
        <div key={section.key}>
          <h2 className="crew-print-row border-b border-black pb-1 text-xl font-black">{section.title}</h2>
          <div className="mt-2 space-y-2">
            {section.items.map((item) => (
              <div key={item.key} className="crew-print-row flex items-start gap-3">
                <PrintBox checked={item.checked} />
                <div>
                  <p className="text-lg font-semibold leading-snug">{item.label}</p>
                  {item.subNote ? <p className="text-base">{item.subNote}</p> : null}
                  {item.note ? <p className="text-base">Note: {item.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="crew-print-row">
        <h2 className="text-xl font-black">Notes</h2>
        <p className="mt-1 whitespace-pre-wrap text-lg">{detail.generalNotes || "None"}</p>
        {notesEnglish ? <p className="mt-1 whitespace-pre-wrap text-lg">English: {notesEnglish}</p> : null}
      </div>
    </CrewPrintSheet>
  );
}
