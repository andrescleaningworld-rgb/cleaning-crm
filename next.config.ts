import type { NextConfig } from "next";

// A Vercel Preview must run on the practice database. Vercel does not allow
// DATABASE_URL to be overridden for previews, so the app reads
// MIGRATION_DATABASE_URL there (lib/db.ts). If it is missing, stop the
// build here: a preview that cannot reach the practice database must not
// come up at all, rather than come up pointed at production.
if (process.env.VERCEL_ENV === "preview") {
  const practice = process.env.MIGRATION_DATABASE_URL?.trim() ?? "";
  if (!practice) {
    throw new Error(
      "Preview build stopped: MIGRATION_DATABASE_URL is not set for the Preview environment. Add it in Vercel → Settings → Environment Variables (Preview) with the practice database (migration-dev) URL."
    );
  }
  // The value must be the connection string itself. A preview once came up
  // with the branch name typed here instead, and every page that needs the
  // database failed.
  if (!/^postgres(ql)?:\/\/[^\s/]+\/\S+/.test(practice)) {
    throw new Error(
      "Preview build stopped: MIGRATION_DATABASE_URL is not a database address. It must be the full connection string of the practice database, starting with postgresql://, not the branch name."
    );
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
