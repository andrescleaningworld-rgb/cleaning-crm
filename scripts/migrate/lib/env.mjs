// Loads env files for migration scripts. `.env.local` supplies the Google
// service-account credentials; `.env.development.local` supplies
// MIGRATION_DATABASE_URL (the Neon dev branch). Values already set in the
// real environment win. DATABASE_URL is never read by migration scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const merged = {};
  for (const name of [".env.local", ".env.development.local"]) {
    const file = path.join(REPO_ROOT, name);
    if (!fs.existsSync(file)) continue;
    Object.assign(merged, parseEnv(fs.readFileSync(file, "utf8")));
  }
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
