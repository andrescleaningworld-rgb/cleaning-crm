"use client";

// Prints one sheet that is not part of the screen (a table made just for
// paper), with the app's own print rule (globals.css: everything is hidden
// on paper except .ui-print-view). The sheet goes straight on <body>, and
// while it prints <body> carries .ui-printing-sheet, so the screen behind it
// takes no room on paper: no blank pages after the sheet.
//
//   <PrintSheet active={printing} onDone={() => setPrinting(false)}>…</PrintSheet>
//
// `active` true: the sheet is put on the page, the print window opens; when
// it closes (printed or not), onDone.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function PrintSheet({ active, onDone, children }: { active: boolean; onDone: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const done = () => {
      body.classList.remove("ui-printing-sheet");
      onDone();
    };
    body.classList.add("ui-printing-sheet");
    window.addEventListener("afterprint", done, { once: true });
    // The sheet is on the page first (this runs after it is drawn), then the print window opens.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
      body.classList.remove("ui-printing-sheet");
    };
  }, [active, onDone]);

  useEffect(() => {
    // Only in the browser: the sheet goes on <body>.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted || !active) return null;
  return createPortal(<div className="ui-print-view ui-print-sheet">{children}</div>, document.body);
}
