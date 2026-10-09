// Self-test for the migration harness. Read-only: one SELECT on the dev
// branch and tab listings from Sheets. Run: node scripts/migrate/check-harness.mjs
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase, GuardError } from "./lib/guard.mjs";
import { getSql } from "./lib/pg.mjs";
import { listTabs } from "./lib/sheets-readonly.mjs";

loadEnv();
let failed = false;
const check = (label, ok, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};

const refused = (url) => {
  try {
    assertDevDatabase(url);
    return false;
  } catch (e) {
    return e instanceof GuardError;
  }
};

// Stand-ins for "not the dev branch": another Neon endpoint (what production
// looks like), a non-Neon host, a look-alike host, and a missing URL.
check("guard refuses another Neon endpoint", refused("postgresql://u:p@ep-other-branch-12345678-pooler.c-10.us-east-1.aws.neon.tech/neondb"));
check("guard refuses a non-Neon host", refused("postgresql://u:p@localhost:5432/neondb"));
check("guard refuses a look-alike host", refused("postgresql://u:p@ep-small-credit-auvaagcl.example.com/neondb"));
check("guard refuses a missing URL", refused(undefined));
check("guard accepts MIGRATION_DATABASE_URL", !refused(process.env.MIGRATION_DATABASE_URL));

try {
  const [row] = await getSql()`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`;
  check("dev database answers", row.n > 0, `${row.n} public tables`);
} catch (e) {
  check("dev database answers", false, e.message);
}

for (const sheet of ["MAIN", "PORTAL", "CUSTVISITS"]) {
  try {
    const { title, tabs } = await listTabs(sheet);
    check(`Sheets read-only: ${sheet}`, tabs.length > 0, `"${title}", ${tabs.length} tabs`);
  } catch (e) {
    check(`Sheets read-only: ${sheet}`, false, e.message);
  }
}

// Not process.exit(): on Windows it can abort while fetch sockets are closing.
process.exitCode = failed ? 1 : 0;
