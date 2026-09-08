import { NextResponse } from "next/server";

// Always executes fresh (never statically cached across deployments) — the
// whole point is that this reflects whichever deployment is actually
// running right now, not whatever was current when a build happened to run.
export const dynamic = "force-dynamic";

// VERCEL_GIT_COMMIT_SHA is a Vercel System Environment Variable, injected
// automatically for git-connected deployments (no project config needed) —
// unlike NEXT_PUBLIC_-prefixed vars, it doesn't depend on the "Automatically
// expose System Environment Variables" project toggle. Falls back to a
// constant in local dev, where it's unset, so the version-check banner never
// fires there.
export async function GET() {
  return NextResponse.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA || "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
