// Step 4 helper: points callers at an area's switchable data layer.
//
//   node scripts/migrate/switch-imports.mjs <area> <name> [<name> ...] [--dry-run]
//
// In every .ts/.tsx file under app/ and lib/ (except lib/googleSheets.ts,
// lib/data/** and lib/pg/**), the listed names are moved out of the import
// from "@/lib/googleSheets" (or "./googleSheets") into an import from
// "@/lib/data/<area>". Other names in that import stay where they are.
// Dynamic imports (await import("@/lib/googleSheets")) are reported, not
// changed.
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./lib/env.mjs";

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const [area, ...names] = args;
if (!area || names.length === 0) {
  console.error("Usage: node scripts/migrate/switch-imports.mjs <area> <name> [...] [--dry-run]");
  process.exit(1);
}
const wanted = new Set(names);
const target = `@/lib/data/${area}`;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

const skip = (rel) => rel === "lib/googleSheets.ts" || rel.startsWith("lib/data/") || rel.startsWith("lib/pg/");
// import { a, type B, c as d } from "@/lib/googleSheets";   (may span lines)
const IMPORT = /import\s*(type\s+)?\{([^}]*)\}\s*from\s*(["'])(@\/lib\/googleSheets|\.\/googleSheets|\.\.\/googleSheets)\3;?/g;

let changed = 0;
for (const root of ["app", "lib"]) {
  for (const file of walk(path.join(REPO_ROOT, root))) {
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
    if (skip(rel)) continue;
    const original = fs.readFileSync(file, "utf8");
    const eol = original.includes("\r\n") ? "\r\n" : "\n";

    for (const name of wanted) {
      if (new RegExp(`import\\(\\s*["']@/lib/googleSheets["']\\s*\\)[^;]*\\b${name}\\b`).test(original)) {
        console.log(`CHECK BY HAND  ${rel}: dynamic import uses ${name}`);
      }
    }

    const text = original.replace(IMPORT, (whole, typeOnly, body, quote, source) => {
      const specs = body.split(",").map((s) => s.trim()).filter(Boolean);
      const moved = [];
      const kept = [];
      for (const spec of specs) {
        const imported = spec.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        (wanted.has(imported) ? moved : kept).push(spec);
      }
      if (moved.length === 0) return whole;
      const keyword = typeOnly ? "import type" : "import";
      const render = (list, from) =>
        list.length > 3 || whole.includes("\n")
          ? `${keyword} {${eol}${list.map((s) => `  ${s},`).join(eol)}${eol}} from "${from}";`
          : `${keyword} { ${list.join(", ")} } from "${from}";`;
      const parts = [];
      if (kept.length) parts.push(render(kept, source));
      parts.push(render(moved, target));
      return parts.join(eol);
    });

    if (text !== original) {
      changed++;
      console.log(`${dryRun ? "would change" : "changed"}  ${rel}`);
      if (!dryRun) fs.writeFileSync(file, text);
    }
  }
}
console.log(`${changed} files ${dryRun ? "would change" : "changed"}.`);
