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

// The redesign branch's preview is for looking at screens with practice data
// only. Vercel cannot hold branch settings before the branch exists, so the
// very first push would otherwise build a preview that reads and writes the
// live Sheets and can send real texts and emails. Stop the build instead
// until the safety settings are there.
const SAFE_PREVIEW_BRANCHES = ["redesign/simple", "feature/photos", "feature/pin-to-board", "feature/no-apps-script"];
if (process.env.VERCEL_ENV === "preview" && SAFE_PREVIEW_BRANCHES.includes(process.env.VERCEL_GIT_COMMIT_REF ?? "")) {
  const missing = [
    process.env.SHEETS_READ_ONLY === "1" ? "" : "SHEETS_READ_ONLY=1",
    process.env.OUTBOUND_DRY_RUN === "1" ? "" : "OUTBOUND_DRY_RUN=1",
    process.env.DATA_SOURCE_ACCOUNTS === "postgres" ? "" : "DATA_SOURCE_*=postgres",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Preview build stopped: the ${process.env.VERCEL_GIT_COMMIT_REF} preview needs ${missing.join(", ")} set for Preview on this branch.`);
  }
}

const nextConfig: NextConfig = {
  // The Photos page asks Next's image resizer for small thumbnails of files
  // kept in Blob storage.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
