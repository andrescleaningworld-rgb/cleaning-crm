// Updates the PROGRESS section of docs/MIGRATION_PLAN.md (plan rule 8).
//
//   node scripts/migrate/progress.mjs --done "<line>" --next "<text>" --log "<area/step | commit | note>" \
//        [--start 22:36] [--status "<text>"] [--decision "<what | why | how to change>"] [--blocked "<text>"]
//        [--area "<name>=<status>|<actual h>|<finished>|<notes>"]
//
// Every flag is optional and --done / --decision / --blocked may repeat.
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./lib/env.mjs";

const file = path.join(REPO_ROOT, "docs", "MIGRATION_PLAN.md");
let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const args = process.argv.slice(2);
const all = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const one = (flag) => all(flag)[0];

function replaceLine(pattern, next) {
  const match = pattern.exec(text);
  if (!match) throw new Error(`PROGRESS: could not find ${pattern}`);
  text = text.replace(match[0], () => next);
}

/** Appends a bullet to the list that follows a "**Heading**" line. */
function addBullet(heading, bullet) {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`PROGRESS: could not find ${heading}`);
  const end = text.indexOf("\n\n", start);
  let block = text.slice(start, end).replace("\n- (none yet)", "");
  block += `\n- ${bullet}`;
  text = text.slice(0, start) + block + text.slice(end);
}

if (one("--status")) replaceLine(/\*\*Status:\*\*.*\n/, `**Status:** ${one("--status")}\n`);
for (const line of all("--done")) addBullet("**Done:**", line);
if (one("--next")) replaceLine(/\*\*Next step:\*\*.*\n/, `**Next step:** ${one("--next")}\n`);
for (const line of all("--decision")) addBullet("**Decisions made without Andres**", line);
for (const line of all("--blocked")) addBullet("**Blocked and skipped:**", line);

if (one("--area")) {
  // "1 Catalogs=done|1.2|2026-10-08|notes" → updates that row of the area table.
  const [name, rest] = one("--area").split("=");
  const [status, actual, finished, notes] = rest.split("|");
  const row = new RegExp(`\\| ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\|[^\\n]*\\n`).exec(text);
  if (!row) throw new Error(`PROGRESS: no area row "${name}"`);
  const cells = row[0].trim().split("|").slice(1, -1).map((c) => c.trim());
  if (status) cells[1] = status;
  if (actual) cells[3] = actual;
  if (!cells[4]) cells[4] = new Date().toLocaleDateString("en-CA");
  if (finished) cells[5] = finished;
  if (notes) cells[6] = notes;
  text = text.replace(row[0], () => `| ${cells.join(" | ")} |\n`);
}

if (one("--log")) {
  const now = new Date();
  const day = now.toLocaleDateString("en-CA");
  const time = now.toTimeString().slice(0, 5);
  const start = one("--start");
  text = `${text.trimEnd()}\n- ${day}T${start ? `${start} → ${time}` : time} | ${one("--log")}\n`;
}

fs.writeFileSync(file, text);
console.log("PROGRESS updated.");
