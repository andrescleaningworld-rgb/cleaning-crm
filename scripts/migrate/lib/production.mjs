// The production database address, for the few scripts that are run against
// production on purpose (each one needs --production and the owner's OK).
//
// It is read from .env.production.local in the project folder: either a
// DATABASE_URL= line, or a file that holds just the address. It is never
// printed and that file is never committed (.gitignore: .env*). The practice
// database's address is refused, so the two cannot be mixed up.
// guard.mjs is not involved and is not weakened: every other script still
// only reaches the practice database.
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./env.mjs";
import { ALLOWED_ENDPOINTS } from "./guard.mjs";

export function productionUrl() {
  const file = path.join(REPO_ROOT, ".env.production.local");
  if (!fs.existsSync(file)) throw new Error(".env.production.local is not here. Nothing was done.");
  const lines = fs
    .readFileSync(file, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const named = lines.find((line) => line.startsWith("DATABASE_URL="));
  const raw = named ? named.slice("DATABASE_URL=".length) : (lines.find((line) => /^postgres(ql)?:\/\//.test(line)) ?? "");
  const url = raw.trim().replace(/^["']|["']$/g, "");
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("The address in .env.production.local is empty, a placeholder, or not a database address. Nothing was done.");
  }
  if (!/^postgres(ql)?:\/\//.test(url) || !host.endsWith(".neon.tech")) throw new Error("The address in .env.production.local is not a Neon database address. Nothing was done.");
  if (ALLOWED_ENDPOINTS.includes(host.split(".")[0].replace(/-pooler$/, ""))) throw new Error("That address is the practice database, not production. Nothing was done.");
  return url;
}
