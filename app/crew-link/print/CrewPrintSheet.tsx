"use client";

// Shared shell for the Crew Link printouts (blank checklist, completed
// checklist, completed supply order): a big Print button on screen, and a
// printout with no nav bar, no buttons, black text on white, letter paper.
// Admin-only pages (not in proxy.ts PUBLIC_PATHS). Printouts show the account
// name and the checklist/order content only — nothing else about the account.
import type { ReactNode } from "react";

// globals.css hides everything when printing (body * { visibility: hidden })
// and re-shows only a page's own opt-in container — .crew-print-view is that
// container here, same contract as .todo-print-view / .supply-order-print-view.
export function CrewPrintStyles() {
  return (
    <style>{`
      @media print {
        @page {
          size: letter;
          margin: 0.5in;
        }

        .crew-print-view,
        .crew-print-view * {
          visibility: visible;
          color: #000 !important;
          background: #fff !important;
          box-shadow: none !important;
        }

        .crew-print-row {
          break-inside: avoid;
        }
      }
    `}</style>
  );
}

export function PrintButton() {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex min-h-[64px] items-center gap-3 rounded-2xl bg-blue-700 px-8 text-xl font-bold text-white shadow-sm hover:bg-blue-800"
      >
        <span aria-hidden="true">🖨️</span> Print
      </button>
    </div>
  );
}

// An empty or ticked box, drawn with a border so it prints the same everywhere.
export function PrintBox({ checked = false }: { checked?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border-2 border-black text-xl font-black leading-none"
    >
      {checked ? "✓" : ""}
    </span>
  );
}

// "Label: ________" for filling in by hand.
export function PrintBlankLine({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-2">
      <span className="text-lg font-bold">{label}:</span>
      <span className="h-8 flex-1 border-b-2 border-black" />
    </div>
  );
}

export function PrintFact({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-lg">
      <span className="font-bold">{label}:</span> {value || "—"}
    </p>
  );
}

export default function CrewPrintSheet({
  accountName,
  title,
  children,
}: {
  accountName: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <CrewPrintStyles />
      <PrintButton />

      <div className="crew-print-view space-y-5 bg-white text-black">
        <div className="border-b-2 border-black pb-3">
          <h1 className="text-3xl font-black leading-tight">{accountName}</h1>
          <p className="mt-1 text-xl font-bold">{title}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
