// Per-area switch for the Sheets → Postgres migration.
//
// Each area reads DATA_SOURCE_<AREA> ("sheets" or "postgres"). Anything else,
// including unset, means "sheets", so production keeps today's behavior until
// an area's flag is flipped on purpose. Env var changes apply on the next
// redeploy.
//
// lib/data/<area>.ts calls dataSource("<AREA>") and forwards to either
// lib/pg/<area>.ts or the existing Sheets / Apps Script code, keeping the
// same function names and return shapes.

export const DATA_SOURCE_AREAS = [
  "CATALOGS",
  "PEOPLE",
  "SUBS",
  "ACCOUNTS",
  "EQUIPMENT",
  "SCHEDULING",
  "VISITS",
  "COMPLAINTS",
  "TODOS",
  "SALES",
  "CUSTOMER_PORTAL",
  "SUPPLIES",
  "SUB_PORTAL",
  "ACCOUNT_UPDATES",
  "ACCOUNT_PACKET",
] as const;

export type DataSourceArea = (typeof DATA_SOURCE_AREAS)[number];
export type DataSource = "sheets" | "postgres";

export function dataSource(area: DataSourceArea): DataSource {
  const value = process.env[`DATA_SOURCE_${area}`]?.trim().toLowerCase();
  return value === "postgres" ? "postgres" : "sheets";
}

export function isPostgres(area: DataSourceArea): boolean {
  return dataSource(area) === "postgres";
}

/** Every area's current source, for the settings/diagnostics screens and logs. */
export function allDataSources(): Record<DataSourceArea, DataSource> {
  const result = {} as Record<DataSourceArea, DataSource>;
  for (const area of DATA_SOURCE_AREAS) result[area] = dataSource(area);
  return result;
}
