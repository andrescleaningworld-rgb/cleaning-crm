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

export function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL!);
  }
  return _sql;
}
