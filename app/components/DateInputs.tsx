"use client";

// Every date box in the app (<input type="date">) opens its calendar when it
// is clicked or tapped anywhere, not only on the small calendar icon, and
// never shows the browser's saved entries (names, emails, "Office Cleaning")
// over it. One listener on the page, so no form has to remember it.

import { useEffect } from "react";

function dateInput(target: EventTarget | null): HTMLInputElement | null {
  return target instanceof HTMLInputElement && target.type === "date" && !target.disabled && !target.readOnly ? target : null;
}

export default function DateInputs() {
  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const input = dateInput(event.target);
      if (input && input.autocomplete !== "off") input.autocomplete = "off";
    };
    const onClick = (event: MouseEvent) => {
      const input = dateInput(event.target);
      if (!input || typeof input.showPicker !== "function") return;
      try {
        input.showPicker();
      } catch {
        // Some browsers allow it only from a direct tap; their own icon still opens it.
      }
    };
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
