// Safety guard for every migration script that connects to Postgres.
//
// Allow-list, not forbid-list: only the Neon dev branch "migration-dev" may be
// used. Any other host is refused, which covers production (its host is not
// known on this machine) and every other database. If the production host
// becomes known, add it to FORBIDDEN_HOSTS as a second lock.
//
// Never weaken this file to make a script run. If the dev branch is
// recreated, replace the endpoint id in ALLOWED_ENDPOINTS.

// Neon endpoint ids (the first host label, without "-pooler").
export const ALLOWED_ENDPOINTS = ["ep-small-credit-auvaagcl"];

// Exact hosts that must never be used, pooled or direct.
export const FORBIDDEN_HOSTS = [];

export class GuardError extends Error {}

function endpointId(hostname) {
  return hostname.split(".")[0].replace(/-pooler$/, "");
}

/** Returns the URL unchanged if it is the dev branch; throws GuardError otherwise. */
export function assertDevDatabase(url) {
  if (!url) {
    throw new GuardError("MIGRATION_DATABASE_URL is not set. Put the Neon dev branch URL in .env.development.local.");
  }
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new GuardError("MIGRATION_DATABASE_URL is not a valid URL.");
  }
  if (FORBIDDEN_HOSTS.includes(host)) {
    throw new GuardError(`REFUSED: ${host} is a forbidden (production) host.`);
  }
  if (!host.endsWith(".neon.tech") || !ALLOWED_ENDPOINTS.includes(endpointId(host))) {
    throw new GuardError(
      `REFUSED: ${host} is not the migration-dev branch. Migration scripts only run against: ${ALLOWED_ENDPOINTS.join(", ")}.`
    );
  }
  return url;
}
