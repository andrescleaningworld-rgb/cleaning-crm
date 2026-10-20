// An account's Frequency: one of a short list, or "Other" with the office's
// own words. The Frequency field holds the list text itself ("2x per week")
// or, for Other, whatever was typed ("2x Wk; Ofc; 2x Mo WH Floors").
//
// Cleanings a month turn the sub's price per cleaning into the monthly
// Subcontractor Pay and back: a week is 52 / 12 = 4.33 weeks a month, so
// 1x per week = 4.33 cleanings and every other week = 2.17. "Other" has no
// count, so its pay is entered by the month.

export const WEEKS_PER_MONTH = 52 / 12;

export const FREQUENCY_OPTIONS = [
  "1x per week",
  "2x per week",
  "3x per week",
  "4x per week",
  "5x per week",
  "6x per week",
  "7x per week",
  "Every other week",
  "1x per month",
  "2x per month",
] as const;

export type FrequencyOption = (typeof FREQUENCY_OPTIONS)[number];

/** The choice in the Frequency dropdown for a stored value: a list item, "Other", or "" when blank. */
export function frequencyChoice(value: string | undefined | null): FrequencyOption | "Other" | "" {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return (FREQUENCY_OPTIONS as readonly string[]).includes(text) ? (text as FrequencyOption) : "Other";
}

/** Cleanings in an average month, or null for Other / blank (no count to work with). */
export function cleaningsPerMonth(value: string | undefined | null): number | null {
  const choice = frequencyChoice(value);
  if (choice === "" || choice === "Other") return null;
  if (choice === "Every other week") return WEEKS_PER_MONTH / 2;
  const perMonth = /^(\d)x per month$/.exec(choice);
  if (perMonth) return Number(perMonth[1]);
  const perWeek = /^(\d)x per week$/.exec(choice);
  return perWeek ? Number(perWeek[1]) * WEEKS_PER_MONTH : null;
}

/** "4.33", "2.17", "1": cleanings a month for showing next to the price. */
export function cleaningsPerMonthText(count: number): string {
  return Number.isInteger(count) ? String(count) : count.toFixed(2);
}

const roundCents = (value: number) => Math.round(value * 100) / 100;

/** Monthly Subcontractor Pay from the sub's price per cleaning; null when it cannot be worked out. */
export function monthlyPayFromPerCleaning(perCleaning: number, frequency: string | undefined | null): number | null {
  const count = cleaningsPerMonth(frequency);
  if (count === null || !Number.isFinite(perCleaning) || perCleaning <= 0) return null;
  return roundCents(perCleaning * count);
}

/** The sub's price per cleaning from the monthly Subcontractor Pay; null when it cannot be worked out. */
export function perCleaningFromMonthlyPay(monthlyPay: number, frequency: string | undefined | null): number | null {
  const count = cleaningsPerMonth(frequency);
  if (count === null || !Number.isFinite(monthlyPay) || monthlyPay <= 0) return null;
  return roundCents(monthlyPay / count);
}

/**
 * The list item an old free-text Frequency means, or null when it is not
 * clearly one of them (it then stays as it is, as Other). Only plain
 * spellings are matched: anything with extra words ("1x week - after 8pm",
 * "2x per week, 1x per week") is left for a person to read.
 */
export function matchFrequency(raw: string | undefined | null): FrequencyOption | null {
  const text = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  const weekly = /^([1-7]) ?x ?(?:per |a )?(?:week|wk)\.?$/.exec(text) ?? /^([1-7]) days? per week$/.exec(text);
  if (weekly) return `${weekly[1]}x per week` as FrequencyOption;
  if (/^(?:1x )?(?:e\/?o ?w(?:ee)?k|eow|every other week|bi-?weekly)$/.test(text)) return "Every other week";
  const monthly = /^([12]) ?x ?(?:per |a )?(?:month|mo)\.?$/.exec(text);
  if (monthly) return `${monthly[1]}x per month` as FrequencyOption;
  return null;
}

const amountOf = (text: string) => Number(String(text ?? "").replace(/[$,\s]/g, ""));

/** For the account forms: the monthly pay text for a typed price per cleaning, or undefined when it cannot be worked out. */
export function monthlyPayText(perText: string, frequency: string | undefined | null): string | undefined {
  const pay = monthlyPayFromPerCleaning(amountOf(perText), frequency);
  return pay === null ? undefined : String(pay);
}

/** For the account forms: the price per cleaning text for a typed monthly pay, or "" when it cannot be worked out. */
export function perCleaningText(payText: string, frequency: string | undefined | null): string {
  const per = perCleaningFromMonthlyPay(amountOf(payText), frequency);
  return per === null ? "" : per.toFixed(2);
}

/** The line under "Sub price per cleaning" on the account forms. */
export function perCleaningHint(frequency: string | undefined | null): string {
  const count = cleaningsPerMonth(frequency);
  if (count === null) return "Pick a Frequency from the list to work out the monthly pay from this. With Other, enter the monthly pay.";
  return `× ${cleaningsPerMonthText(count)} cleanings a month (${String(frequency).trim()}) = the monthly pay. Enter either one; the other fills in.`;
}
