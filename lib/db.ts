import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Lazy singleton — neon() throws if DATABASE_URL isn't set, and Next.js
// evaluates top-level module code at build time, so calling neon() eagerly
// here would crash `next build` before the Neon integration's env vars
// exist. Do not wrap this in a Proxy (breaks libraries that introspect the
// client object) — a plain lazy accessor is enough since we only ever call
// getSql() from inside request handlers. Explicitly typed as
// NeonQueryFunction<false, false> (the default, non-array, non-full-results
// mode) rather than relying on ReturnType<typeof neon>, which resolves to a
// broad overloaded union that loses row-array typing at call sites.
let _sql: NeonQueryFunction<false, false> | null = null;

/**
 * Which database this deployment talks to. The one place that decides.
 *
 *   Production      DATABASE_URL, always. MIGRATION_DATABASE_URL is ignored
 *                   there even if someone sets it, so production can never
 *                   be pointed at the practice database by that variable.
 *   Vercel Preview  MIGRATION_DATABASE_URL (the practice database), and
 *                   nothing else: Vercel does not allow DATABASE_URL to be
 *                   overridden for previews, so without this a preview would
 *                   read and write the production database. A preview with
 *                   no MIGRATION_DATABASE_URL refuses to run.
 *   Local dev       MIGRATION_DATABASE_URL when set, else DATABASE_URL.
 */
/**
 * The Neon endpoint of the PRODUCTION database (the first part of its host,
 * without "-pooler"). Not a secret: it is no use without the password.
 * next.config.ts has the same list for the build; keep the two the same.
 */
export const PRODUCTION_ENDPOINTS = ["ep-old-unit-auedho5y"];

/** True when a database address points at the production database. */
export function isProductionDatabase(value: string | undefined): boolean {
  const text = (value ?? "").trim().toLowerCase();
  return PRODUCTION_ENDPOINTS.some((endpoint) => text.includes(endpoint));
}

/**
 * A Vercel Preview must never hold the production database's address in
 * either of the two settings this app can open a database from.
 * MIGRATION_DATABASE_URL is the one a preview uses; DATABASE_URL is not read
 * in a preview, but Vercel's Neon connection puts production's address in it
 * for every environment, and only one rule in this file stands between that
 * and a preview. So a preview whose DATABASE_URL was not overridden with the
 * practice database refuses to run (and to build: next.config.ts).
 */
export function assertPreviewIsNotOnProduction(): void {
  for (const name of ["MIGRATION_DATABASE_URL", "DATABASE_URL"] as const) {
    if (isProductionDatabase(process.env[name])) {
      throw new Error(
        `This Vercel Preview holds the PRODUCTION database address in ${name}. A preview must only know the practice database. In Vercel, Settings, Environment Variables, add ${name} for Preview on this branch with the practice database, then redeploy.`
      );
    }
  }
}

/** A full Postgres connection string (postgres:// or postgresql://, with a host), not a name or a blank. */
export function looksLikePostgresUrl(value: string): boolean {
  return /^postgres(ql)?:\/\/[^\s/]+\/\S+/.test(value.trim());
}

export function databaseUrl(): string {
  const vercelEnv = process.env.VERCEL_ENV;
  const practice = process.env.MIGRATION_DATABASE_URL?.trim();

  // `next dev` on a developer's machine counts as local even when a pulled
  // .env.local carries VERCEL_ENV="production".
  const local = process.env.NODE_ENV !== "production";

  if (vercelEnv === "preview") {
    assertPreviewIsNotOnProduction();
    if (!practice) {
      throw new Error("MIGRATION_DATABASE_URL is not set for this Vercel Preview. A preview must use the practice database and refuses to fall back to DATABASE_URL (production).");
    }
    if (!looksLikePostgresUrl(practice)) {
      throw new Error("MIGRATION_DATABASE_URL for this Vercel Preview is not a database address. It must be the full connection string that starts with postgresql://, not the branch name.");
    }
    return practice;
  }
  if (local && practice) return practice;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set.");
  return url;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(databaseUrl());
  }
  return _sql;
}
