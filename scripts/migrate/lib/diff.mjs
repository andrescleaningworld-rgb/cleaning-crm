// Deep comparison of two JSON-like values for the parity tester.
// Returns a list of differences as { path, sheets, postgres }.

// Keys that only exist because of where the data lives.
export const DEFAULT_IGNORED_KEYS = ["sheetRow"];

function kind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function deepDiff(sheets, postgres, { ignoreKeys = DEFAULT_IGNORED_KEYS, maxDiffs = 200 } = {}) {
  const diffs = [];
  const ignored = new Set(ignoreKeys);

  function walk(a, b, path) {
    if (diffs.length >= maxDiffs) return;
    const ka = kind(a);
    const kb = kind(b);
    if (ka !== kb) {
      diffs.push({ path, sheets: a, postgres: b });
      return;
    }
    if (ka === "array") {
      if (a.length !== b.length) {
        diffs.push({ path: `${path}.length`, sheets: a.length, postgres: b.length });
      }
      const shared = Math.min(a.length, b.length);
      for (let i = 0; i < shared; i++) walk(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (ka === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of [...keys].sort()) {
        if (ignored.has(key)) continue;
        // A missing key and an undefined value are the same thing in JSON.
        if (a[key] === undefined && b[key] === undefined) continue;
        walk(a[key], b[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    if (a !== b) diffs.push({ path, sheets: a, postgres: b });
  }

  // JSON round-trip so Dates, undefined and class instances compare the way
  // an API response would.
  walk(JSON.parse(JSON.stringify(sheets ?? null)), JSON.parse(JSON.stringify(postgres ?? null)), "");
  return diffs;
}

/**
 * Re-orders an array of objects by a key so two sources that return the same
 * rows in a different order still line up. Only use when order is not part of
 * what the screen shows.
 */
export function sortByKey(rows, key) {
  return [...rows].sort((x, y) => String(x?.[key] ?? "").localeCompare(String(y?.[key] ?? "")));
}
