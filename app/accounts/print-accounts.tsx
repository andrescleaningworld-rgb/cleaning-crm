"use client";

// Accounts -> More -> Print: "Choose columns" (big checkboxes, remembered on
// this device), then a clean table of the accounts the filters show now,
// every one of them (not only the ones on screen). Printed with PrintSheet,
// the app's one print rule (.ui-print-view).

import { useCallback, useEffect, useState } from "react";
import { BigButton, Sheet } from "@/app/ui";
import PrintSheet from "../components/print-sheet";

export type PrintColumn = "name" | "address" | "sub" | "manager" | "frequency" | "status" | "price" | "subPay" | "margin" | "startDate" | "contact" | "phone" | "email" | "service" | "health" | "keys";

/** One account as the table prints it: a text per column. */
export type PrintRow = Record<PrintColumn, string>;

export const PRINT_COLUMNS: { key: PrintColumn; label: string }[] = [
  { key: "name", label: "Account name" },
  { key: "address", label: "Address" },
  { key: "sub", label: "Subcontractor" },
  { key: "manager", label: "Manager" },
  { key: "frequency", label: "Frequency / days" },
  { key: "status", label: "Status" },
  { key: "price", label: "Monthly price" },
  { key: "subPay", label: "Sub pay" },
  { key: "margin", label: "Margin" },
  { key: "startDate", label: "Start date" },
  { key: "contact", label: "Contact" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "service", label: "Service type" },
  { key: "health", label: "Health" },
  { key: "keys", label: "Keys / alarm (yes or no)" },
];

const DEFAULT_COLUMNS: PrintColumn[] = ["name", "address", "sub", "manager", "frequency", "status", "price"];
const STORAGE_KEY = "cwAccountsPrintColumns";

function storedColumns(): PrintColumn[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
    if (Array.isArray(saved)) {
      const known = saved.filter((key): key is PrintColumn => PRINT_COLUMNS.some((column) => column.key === key));
      if (known.length > 0) return known;
    }
  } catch {
    // Nothing saved, or this browser keeps nothing: the usual columns.
  }
  return DEFAULT_COLUMNS;
}

export default function PrintAccounts({ open, onClose, rows, summary }: { open: boolean; onClose: () => void; rows: PrintRow[]; summary: string }) {
  const [chosen, setChosen] = useState<PrintColumn[]>(DEFAULT_COLUMNS);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    // Each opening starts from what was picked last time on this device.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setChosen(storedColumns());
  }, [open]);

  const toggle = (key: PrintColumn) => setChosen((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
  // The table keeps the list's order, whatever order they were ticked in.
  const columns = PRINT_COLUMNS.filter((column) => chosen.includes(column.key));
  const done = useCallback(() => setPrinting(false), []);

  function print() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chosen));
    } catch {
      // Not remembered on this device; it still prints.
    }
    onClose();
    setPrinting(true);
  }

  return (
    <>
      <Sheet
        open={open}
        title="🖨 Print accounts"
        text={`Choose columns. ${rows.length} account${rows.length === 1 ? "" : "s"}, as the filters show them now.`}
        onClose={onClose}
        actions={
          <BigButton disabled={columns.length === 0 || rows.length === 0} onClick={print}>
            🖨 Print
          </BigButton>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-print-columns>
          {PRINT_COLUMNS.map((column) => (
            <label key={column.key} className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl px-4 text-lg font-bold ${chosen.includes(column.key) ? "bg-blue-50 ring-2 ring-blue-600" : "bg-white ring-1 ring-slate-300"}`}>
              <input type="checkbox" className="h-7 w-7 shrink-0" checked={chosen.includes(column.key)} onChange={() => toggle(column.key)} />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
        {columns.length === 0 ? <p className="ui-field-error">Pick at least one column.</p> : null}
        <div className="ui-actions-row" style={{ marginTop: 8 }}>
          <button type="button" className="ui-btn ui-btn-second" onClick={() => setChosen(PRINT_COLUMNS.map((column) => column.key))}>
            All
          </button>
          <button type="button" className="ui-btn ui-btn-second" onClick={() => setChosen(DEFAULT_COLUMNS)}>
            The usual
          </button>
        </div>
      </Sheet>

      <PrintSheet active={printing} onDone={done}>
        <div style={{ padding: 16, color: "#000", fontFamily: "Arial, sans-serif" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Cleaning World · Accounts</h1>
          <p style={{ fontSize: 12, margin: "0 0 12px" }}>
            {summary} · Printed {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} style={{ textAlign: "left", borderBottom: "2px solid #000", padding: "4px 6px" }}>
                    {column.label.replace(" (yes or no)", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} style={{ breakInside: "avoid" }}>
                  {columns.map((column) => (
                    <td key={column.key} style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", verticalAlign: "top" }}>
                      {row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PrintSheet>
    </>
  );
}
