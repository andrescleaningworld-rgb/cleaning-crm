// The printed "Complaint Review" (app/components/complaint-review-print.tsx):
// the date range presets, one complaint as the printout reads it, and the
// problem areas the summary counts. Client-safe: no server imports.
//
// The printout is handed to the sub: only what is listed in ReviewComplaint
// goes on paper (never notes, the manager, money, or score).

export type DatePreset = "all" | "30" | "60" | "90" | "year" | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "Any date" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

const clean = (value: unknown) => String(value ?? "").trim();

export function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The From / To (YYYY-MM-DD, "" = open) a preset stands for, counted from today. */
export function presetRange(preset: DatePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  if (preset === "custom") return { from: customFrom, to: customTo };
  if (preset === "year") return { from: `${today.getFullYear()}-01-01`, to: "" };
  if (preset === "all") return { from: "", to: "" };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(preset));
  return { from: localIso(start), to: "" };
}

/** A calendar day or a moment as a Date; a bare YYYY-MM-DD is that day in local time (never the day before). */
export function parseDay(value: unknown): Date | null {
  const text = clean(value);
  if (!text) return null;
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = dayOnly ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3])) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Nov 3, 2026" ("" when not a date). */
export function dayText(value: unknown): string {
  const date = parseDay(value);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

/** The days a From / To covers, in words: "Aug 18, 2026 – Nov 16, 2026". */
export function rangeText(from: string, to: string, earliest = ""): string {
  const start = dayText(from) || dayText(earliest);
  const end = dayText(to) || dayText(localIso(new Date()));
  return start ? `${start} – ${end}` : `All dates through ${end}`;
}

/** Is this date inside From / To (YYYY-MM-DD, "" = open)? A complaint with no date stays in. */
export function inRange(date: unknown, from: string, to: string): boolean {
  const day = parseDay(date);
  if (!day) return true;
  const iso = localIso(day);
  return (!from || iso >= from) && (!to || iso <= to);
}

/** One complaint as the printout reads it. */
export type ReviewComplaint = {
  /** Complaint ID, or row number when it has none (to look up its address, photos, when fixed). */
  key: string;
  date: string;
  accountName: string;
  type: string;
  issue: string;
  priority: string;
  validity: string;
  status: string;
  resolution: string;
  reportedBy: string;
};

function field(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return "";
}

/** A complaint from GET /api/complaints as the printout reads it (both pages use this). */
export function reviewComplaintOf(row: Record<string, unknown>): ReviewComplaint {
  return {
    key: field(row, ["id"]) || field(row, ["rowNumber"]),
    date: field(row, ["date", "Date", "complaintDate", "Complaint Date"]),
    accountName: field(row, ["accountName", "Account Name", "account", "Account"]),
    type: field(row, ["complaintType"]),
    issue: field(row, ["description", "issue", "Issue", "Description"]),
    priority: field(row, ["severity", "priority"]),
    validity: field(row, ["complaintValidity", "validity", "Validity"]) || "Needs Review",
    status: field(row, ["status", "Status"]) || "Open",
    resolution: field(row, ["resolution"]),
    reportedBy: field(row, ["reportedBy"]),
  };
}

/** Closed for good: Closed, Resolved or Merged (not the team's "Resolved by Sub", which still waits for review). */
export function isClosedStatus(status: unknown): boolean {
  const value = clean(status).toLowerCase();
  return value.startsWith("closed") || (value.startsWith("resolved") && !value.startsWith("resolved by sub")) || value.startsWith("merged");
}

/** Valid only, or also Needs Review / Subjective. Not Valid never goes on the review. */
export function validityCounts(validity: unknown, includeUnsure: boolean): boolean {
  const value = clean(validity).toLowerCase() || "needs review";
  if (value === "valid") return true;
  if (!includeUnsure) return false;
  return value === "needs review" || value === "subjective";
}

/** Who reported it, and how. The portal saves "Customer (portal)"; anything else was typed in by the office. */
export function reportedText(reportedBy: string): { who: string; how: string } {
  const value = clean(reportedBy);
  const lower = value.toLowerCase();
  if (lower === "customer (portal)") return { who: "Customer", how: "Customer portal" };
  const how = /\b(call|called|phone|voicemail)\b/.test(lower)
    ? "Call"
    : /\b(e-?mail)\b/.test(lower)
      ? "Email"
      : /\b(text|sms)\b/.test(lower)
        ? "Text"
        : /\b(manager|inspection|inspected|walk-?through)\b/.test(lower)
          ? "Manager"
          : "Office";
  return { who: value || "Not recorded", how };
}

// The problem areas the summary counts, found in the complaint's type and text.
const AREAS: { name: string; words: RegExp }[] = [
  { name: "Restrooms", words: /\b(bath ?rooms?|rest ?rooms?|toilets?|urinals?|men'?s room|ladies'? room|stalls?|washrooms?)\b/i },
  { name: "Trash", words: /\b(trash|garbage|bins?|waste ?baskets?|recycl\w*|rubbish|dumpsters?)\b/i },
  { name: "Floors", words: /\b(floors?|vacuum\w*|mop\w*|carpets?|rugs?|sweep\w*|swept|mats?)\b/i },
  { name: "Dusting", words: /\b(dust\w*|cobwebs?|blinds|vents?|baseboards?|ledges?)\b/i },
  { name: "Kitchen / break room", words: /\b(kitchens?|break ?rooms?|microwaves?|fridges?|refrigerators?|lunch ?rooms?|coffee)\b/i },
  { name: "Glass / mirrors", words: /\b(windows?|glass|mirrors?|smudges?|fingerprints?)\b/i },
  { name: "Supplies", words: /\b(paper towels?|toilet paper|tissue|soap|supplies|refill\w*|liners?)\b/i },
  { name: "Desks / surfaces", words: /\b(desks?|counters?|tables?|surfaces?|wipe\w*)\b/i },
  { name: "Missed cleaning", words: /\b(missed|skipped|no[- ]show|didn'?t come|did not come|not cleaned|never came)\b/i },
  { name: "Doors / alarm / lights", words: /\b(alarm|unlocked|locked|lights? (were )?left|door (was )?left)\b/i },
];

/** The problem areas one complaint is about ("Other" when none is named). */
export function problemAreas(complaint: Pick<ReviewComplaint, "type" | "issue">): string[] {
  const textToRead = `${complaint.type} ${complaint.issue}`;
  const found = AREAS.filter((area) => area.words.test(textToRead)).map((area) => area.name);
  return found.length > 0 ? found : ["Other"];
}
