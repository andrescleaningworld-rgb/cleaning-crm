"use client";

// Birthday and first day of work on each person's card in Settings -> Staff.
// For staff and managers only. They show on the board calendar and the TV as
// "Happy birthday" and work anniversaries; only the day and month of a
// birthday are ever shown. Saved by /api/staff-dates (its own table, so the
// Staff list itself is not changed). Shows nothing where this is not in the
// database yet.

import { useCallback, useEffect, useState } from "react";

export type StaffDatesMap = Record<string, { birthday: string; workStart: string }>;

export function useStaffDates() {
  const [dates, setDates] = useState<StaffDatesMap>({});
  const [on, setOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/staff-dates", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; on?: boolean; dates?: StaffDatesMap };
      if (!response.ok || data.success !== true) return;
      setOn(data.on === true);
      setDates(data.dates ?? {});
    } catch {
      // The rest of the card works without them.
    }
  }, []);

  useEffect(() => {
    // The list is set only after the answer arrives, never during the effect itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { dates, on, reload: load };
}

const fieldClass = "mt-1 min-h-[56px] w-full rounded-xl border-2 border-gray-300 px-4 text-xl text-gray-900 outline-none focus:border-blue-600 disabled:opacity-60";

export function StaffDatesFields({ staffId, name, value, onSaved }: { staffId: string; name: string; value?: { birthday: string; workStart: string }; onSaved: () => void }) {
  const [birthday, setBirthday] = useState(value?.birthday ?? "");
  const [workStart, setWorkStart] = useState(value?.workStart ?? "");
  const [state, setState] = useState<"" | "saving" | "saved" | "failed">("");
  const [error, setError] = useState("");

  // What is on file arrives after the card is drawn.
  useEffect(() => {
    setBirthday(value?.birthday ?? "");
    setWorkStart(value?.workStart ?? "");
  }, [value?.birthday, value?.workStart]);

  async function save(next: { birthday: string; workStart: string }) {
    setState("saving");
    setError("");
    try {
      const response = await fetch("/api/staff-dates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId, ...next }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success !== true) throw new Error(data.error || "Could not save. Try again.");
      setState("saved");
      onSaved();
    } catch (err) {
      setState("failed");
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-base font-bold text-gray-500">Birthday</span>
          <input
            type="date"
            value={birthday}
            aria-label={`Birthday of ${name}`}
            disabled={state === "saving"}
            className={fieldClass}
            onChange={(event) => {
              setBirthday(event.target.value);
              void save({ birthday: event.target.value, workStart });
            }}
          />
        </label>
        <label className="block">
          <span className="text-base font-bold text-gray-500">First day of work</span>
          <input
            type="date"
            value={workStart}
            aria-label={`First day of work of ${name}`}
            disabled={state === "saving"}
            className={fieldClass}
            onChange={(event) => {
              setWorkStart(event.target.value);
              void save({ birthday, workStart: event.target.value });
            }}
          />
        </label>
      </div>
      <p className="mt-1 text-base text-gray-600" role="status">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : state === "failed" ? <span className="font-bold text-red-700">{error}</span> : "For the calendar and the TV. The year of a birthday is never shown."}
      </p>
    </div>
  );
}
