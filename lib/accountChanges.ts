// "What changed" for an account save — one line per field whose value
// actually changed, old → new, stored as the activity_log entry's detail
// (entity_type "account") and shown in the account's History section. Values
// are shown as they were, prices included (e.g. "Monthly Revenue: $200 →
// $100"), so a manager can always see what was there before. Bookkeeping
// columns that change on every save are skipped.
const SKIP_FIELDS = new Set(["last updated", "lastupdated", "updatedat", "rownumber", "id", "accountid", "account id"]);
const MAX_VALUE_LENGTH = 300;

function show(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "(blank)";
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

// camelCase API keys → "Monthly Revenue"-style labels; sheet headers pass through.
function label(key: string): string {
  if (/\s/.test(key) || !/[a-z][A-Z]/.test(key)) return key;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// before/after: full records (sheet headers or API field names). Only keys
// present in `after` are compared.
export function describeAccountChanges(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, newValue] of Object.entries(after)) {
    if (newValue === undefined || SKIP_FIELDS.has(key.trim().toLowerCase())) continue;
    const oldText = String(before[key] ?? "").trim();
    const newText = String(newValue ?? "").trim();
    if (oldText === newText) continue;
    lines.push(`${label(key)}: ${show(oldText)} → ${show(newText)}`);
  }
  return lines.join("\n");
}
