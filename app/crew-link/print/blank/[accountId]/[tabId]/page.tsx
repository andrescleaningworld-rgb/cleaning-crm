"use client";

// Printable BLANK checklist for one Crew Link tab — for crews to fill out on
// paper: Name / Date / Time lines, every item with an empty box, and a Notes
// area. Prints the tab as last saved.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ChecklistTabDef } from "@/lib/checklistTemplate";
import CrewPrintSheet, { PrintBlankLine, PrintBox } from "../../../CrewPrintSheet";

type TemplateResponse = {
  success?: boolean;
  error?: string;
  template?: { accountName: string } | null;
  tabs?: ChecklistTabDef[];
};

const NOTE_LINES = 5;

export default function CrewLinkPrintBlankChecklistPage() {
  const params = useParams<{ accountId: string; tabId: string }>();
  const accountId = typeof params?.accountId === "string" ? decodeURIComponent(params.accountId) : "";
  const tabId = Number(params?.tabId);
  const [accountName, setAccountName] = useState("");
  const [tab, setTab] = useState<ChecklistTabDef | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/checklist-templates?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
        const data = (await res.json()) as TemplateResponse;
        if (!res.ok || data.success === false) throw new Error(data.error || "Could not load this checklist.");
        const found = (data.tabs ?? []).find((t) => t.id === tabId);
        if (!data.template || !found) throw new Error("This checklist tab no longer exists.");
        if (cancelled) return;
        setAccountName(data.template.accountName);
        setTab(found);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this checklist.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, tabId]);

  if (error) {
    return <p className="p-8 text-center text-lg font-semibold text-red-700">{error}</p>;
  }
  if (!tab) {
    return <p className="p-8 text-center text-lg text-slate-500">Loading checklist…</p>;
  }

  return (
    <CrewPrintSheet accountName={accountName} title={tab.name}>
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
        <div className="sm:col-span-2 print:col-span-2">
          <PrintBlankLine label="Name" />
        </div>
        <PrintBlankLine label="Date" />
        <PrintBlankLine label="Time" />
      </div>

      {tab.sections.length === 0 ? <p className="text-lg">This tab has no items yet.</p> : null}

      {tab.sections.map((section) => (
        <div key={section.key}>
          <h2 className="crew-print-row border-b border-black pb-1 text-xl font-black">{section.title}</h2>
          <div className="mt-2 space-y-2">
            {section.items.map((item) => (
              <div key={item.key} className="crew-print-row flex items-start gap-3">
                <PrintBox />
                <div>
                  <p className="text-lg font-semibold leading-snug">{item.label}</p>
                  {item.subNote ? <p className="text-base">{item.subNote}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="crew-print-row">
        <h2 className="text-xl font-black">Notes</h2>
        {Array.from({ length: NOTE_LINES }, (_, i) => (
          <div key={i} className="h-10 border-b-2 border-black" />
        ))}
      </div>
    </CrewPrintSheet>
  );
}
