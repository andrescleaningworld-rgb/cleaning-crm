// One rule for manager names, used by every Manager filter.
//
// A saved manager is free text and often holds more than one person
// ("Greg , Andres", "Drew/Greg", "Andres and Greg"). Picking a manager in a
// filter finds every record where that person is one of the names. Accents
// and capital letters do not matter ("Andres" is "Andrés"), and a full name
// counts for the first name ("Andres Ferradans" is Andrés).

/** "Andrés " -> "andres": no accents, small letters, single spaces. */
export function managerKey(name: unknown): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The people in one saved value: "Greg , Andres" -> ["greg", "andres"]. */
export function managerParts(raw: unknown): string[] {
  return managerKey(raw)
    .split(/\s*(?:[,/&+;|]|\band\b)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** True when the picked manager is one of the people in the saved value. */
export function managerMatches(raw: unknown, picked: unknown): boolean {
  const key = managerKey(picked);
  if (!key) return true;
  return managerParts(raw).some((part) => part === key || part.startsWith(`${key} `));
}

/**
 * The listed manager a saved value stands for: the same person ("Andres" ->
 * "Andrés"), else the first one written of several ("Greg , Andres" ->
 * "Greg"). "" when none is.
 */
export function pickManager(raw: unknown, names: string[]): string {
  if (!managerKey(raw)) return "";
  const same = names.find((name) => sameManager(name, raw));
  if (same) return same;
  for (const part of managerParts(raw)) {
    const found = names.find((name) => managerMatches(part, name));
    if (found) return found;
  }
  return "";
}

/** True when two names are the same person ("Andres" and "Andrés"). */
export function sameManager(a: unknown, b: unknown): boolean {
  const key = managerKey(a);
  return key !== "" && key === managerKey(b);
}
