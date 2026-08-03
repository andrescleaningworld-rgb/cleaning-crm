// Shared, dependency-free source of truth for To-Do priority tiers — safe to
// import from both server code (lib/googleSheets.ts, app/api/to-do/route.ts)
// and client components (app/to-do/page.tsx). lib/googleSheets.ts itself
// can't fill that role since it imports googleapis and isn't safe to bundle
// client-side. Adding a future tier (e.g. "Urgent") only requires editing
// this file — every consumer derives its options/colors/default from here.

export const TO_DO_PRIORITIES = ["Low", "Medium", "High"] as const;

export type ToDoPriority = (typeof TO_DO_PRIORITIES)[number];

export const DEFAULT_TO_DO_PRIORITY: ToDoPriority = "Medium";

// Used both when reading a sheet row (a blank/invalid cell — including every
// row written before this column existed — resolves to the default) and
// when accepting a value from a request body (an invalid/missing client
// value never reaches the sheet as anything other than a valid tier).
export function normalizeToDoPriority(value: unknown): ToDoPriority {
  return (TO_DO_PRIORITIES as readonly unknown[]).includes(value)
    ? (value as ToDoPriority)
    : DEFAULT_TO_DO_PRIORITY;
}
