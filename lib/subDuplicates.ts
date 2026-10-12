// The duplicate subcontractor warning: before a new sub is saved, is there
// already one with the same name, email or phone? Plain TS with no server
// imports, so the "Add a subcontractor" sheet and the server use one rule.

export type SubIdentity = { companyName: string; contactName: string; email: string; phone: string };
export type DuplicateMatch = "name" | "email" | "phone";
export type SubDuplicate = { label: string; matches: DuplicateMatch[] };

/** A name without capitals, spaces, punctuation or a company ending: "ABC Cleaning, LLC" and "abc cleaning" are the same. */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(llc|inc|corp|co|ltd|company|corporation)\b/g, " ")
    .replace(/\s+/g, "");
}

/** The last 10 digits; too few digits to be a phone number is nothing. */
function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : "";
}

const emailKey = (email: string) => email.trim().toLowerCase();

/** The subs already on file that the new one looks like, each with what is the same. */
export function findDuplicateSubs(candidate: SubIdentity, existing: SubIdentity[]): SubDuplicate[] {
  const names = [nameKey(candidate.companyName), nameKey(candidate.contactName)].filter((key) => key.length >= 3);
  const email = emailKey(candidate.email);
  const phone = phoneKey(candidate.phone);
  const found: SubDuplicate[] = [];
  for (const sub of existing) {
    const matches: DuplicateMatch[] = [];
    const theirNames = [nameKey(sub.companyName), nameKey(sub.contactName)].filter((key) => key.length >= 3);
    if (names.some((name) => theirNames.includes(name))) matches.push("name");
    if (email && email === emailKey(sub.email)) matches.push("email");
    if (phone && phone === phoneKey(sub.phone)) matches.push("phone");
    if (matches.length > 0) found.push({ label: [sub.contactName.trim(), sub.companyName.trim()].filter(Boolean).join(" — ") || "A subcontractor with no name", matches });
  }
  return found;
}

/** "same name and email" */
export function matchWords(matches: DuplicateMatch[]): string {
  const words = matches.map((match) => (match === "name" ? "name" : match === "email" ? "email" : "phone"));
  return `same ${words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]}`;
}
