// Writes migration reports to docs/migration-reports/<area>-<name>.md.
// Reports are committed, so they must never contain secrets (key/alarm codes,
// passwords, connection strings) or full customer rows.
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./env.mjs";

export const REPORTS_DIR = path.join(REPO_ROOT, "docs", "migration-reports");

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** name defaults to today's date: docs/migration-reports/<area>-<date>.md */
export function writeReport(area, markdown, name = today()) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `${area}-${name}.md`);
  fs.writeFileSync(file, markdown.trimEnd() + "\n");
  return path.relative(REPO_ROOT, file).replace(/\\/g, "/");
}

/** Markdown table from a header array and rows of cells. */
export function table(headers, rows) {
  const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${headers.map(esc).join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}
