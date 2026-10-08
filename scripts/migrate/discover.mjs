// Step 0 of every area: read-only look at the real tabs.
//
//   node scripts/migrate/discover.mjs <area>
//
// Writes docs/migration-reports/<area>-headers.md with each tab's header row,
// row counts, and how full each column is. It never writes cell VALUES to the
// report (tabs hold key codes, pay, phone numbers), only headers and counts.
import { isBlankRow, listTabs, readTab } from "./lib/sheets-readonly.mjs";
import { table, today, writeReport } from "./lib/report.mjs";

// Tabs per area: [sheet, tab]. Extra tabs found in the sheets that no area
// claims are listed under "unclaimed" so nothing is silently ignored.
export const AREA_TABS = {
  catalogs: [
    ["PORTAL", "ChangeLog"],
    ["MAIN", "GeocodeCache"],
    ["PORTAL", "ExtraServices"],
    ["MAIN", "Documents"],
    ["MAIN", "DocumentSends"],
  ],
  people: [
    ["MAIN", "Staff"],
    ["MAIN", "Managers"],
  ],
  subs: [
    ["MAIN", "Subcontractors"],
    ["MAIN", "Subcontractor Activity Log"],
  ],
  accounts: [
    ["MAIN", "Accounts"],
    ["MAIN", "OnboardingChecklist"],
    ["MAIN", "Account Updates"],
    ["MAIN", "Sub Transfer Proposals"],
  ],
  equipment: [
    ["MAIN", "EquipmentCategories"],
    ["MAIN", "Equipment"],
    ["MAIN", "EquipmentCheckouts"],
    ["MAIN", "EquipmentRepairs"],
    ["MAIN", "EquipmentParts"],
  ],
  scheduling: [
    ["MAIN", "SubSchedules"],
    ["MAIN", "ScheduleExceptions"],
    ["PORTAL", "subcontractor-visits"],
  ],
  visits: [
    ["MAIN", "Visits"],
    ["MAIN", "VisitEditLog"],
  ],
  complaints: [["MAIN", "Complaints"]],
  todos: [
    ["MAIN", "To Do"],
    ["MAIN", "SmsLog"],
  ],
  sales: [["MAIN", "Sales & Commissions"]],
  "customer-portal": [
    ["PORTAL", "customer-portal"],
    ["PORTAL", "portal-complaints"],
    ["PORTAL", "portal-service-requests"],
    ["PORTAL", "portal-date-changes"],
  ],
  supplies: [
    ["MAIN", "Supplies"],
    ["MAIN", "Supply Orders"],
  ],
  "sub-portal": [
    ["MAIN", "Sub Portal Issues"],
    ["MAIN", "Photos"],
  ],
};

const columnLetter = (index) => {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

async function describeTab(sheet, tab) {
  const [rows, formulas] = await Promise.all([
    readTab(sheet, tab),
    // Row 2 with formulas shown, to spot ARRAYFORMULA / computed columns.
    readTab(sheet, tab, { range: "1:2", formulas: true }),
  ]);
  const header = rows[0] ?? [];
  const data = rows.slice(1);
  const nonBlank = data.filter((row) => !isBlankRow(row));
  const width = Math.max(header.length, ...data.map((row) => row.length), 0);
  const formulaCells = [...(formulas[0] ?? []), ...(formulas[1] ?? [])];
  const columns = [];
  for (let c = 0; c < width; c++) {
    const filled = nonBlank.filter((row) => String(row[c] ?? "").trim() !== "").length;
    const distinct = new Set(nonBlank.map((row) => String(row[c] ?? "").trim()).filter(Boolean)).size;
    const isFormula = [formulas[0]?.[c], formulas[1]?.[c]].some((cell) => String(cell ?? "").startsWith("="));
    columns.push([
      columnLetter(c),
      header[c] ?? "(no header)",
      filled,
      nonBlank.length ? `${Math.round((filled / nonBlank.length) * 100)}%` : "–",
      distinct,
      isFormula ? "formula" : "",
    ]);
  }
  return {
    sheet,
    tab,
    dataRows: data.length,
    nonBlank: nonBlank.length,
    blank: data.length - nonBlank.length,
    lastRow: rows.length,
    hasFormulas: formulaCells.some((cell) => String(cell).startsWith("=")),
    columns,
  };
}

const area = process.argv[2];
if (area === "--tabs") {
  // Which tabs exist, and which no area claims.
  const claimed = new Set(Object.values(AREA_TABS).flat().map(([sheet, tab]) => `${sheet}/${tab}`));
  for (const sheet of ["MAIN", "PORTAL"]) {
    const { title, tabs } = await listTabs(sheet);
    console.log(`${sheet} "${title}"`);
    for (const tab of tabs) console.log(`  ${claimed.has(`${sheet}/${tab.name}`) ? "claimed  " : "UNCLAIMED"}  ${tab.name}`);
  }
} else if (!AREA_TABS[area]) {
  console.error(`Usage: node scripts/migrate/discover.mjs <${Object.keys(AREA_TABS).join("|")}> | --tabs`);
  process.exitCode = 1;
} else {
  const parts = [
    `# ${area} – real headers and row counts`,
    "",
    `Read-only snapshot taken ${today()} by \`scripts/migrate/discover.mjs ${area}\`. Headers and counts only; no cell values.`,
    "",
  ];
  const summary = [];
  for (const [sheet, tab] of AREA_TABS[area]) {
    try {
      const info = await describeTab(sheet, tab);
      summary.push([sheet, tab, info.nonBlank, info.blank, info.columns.length, info.hasFormulas ? "yes" : "no"]);
      parts.push(
        `## ${tab} (${sheet})`,
        "",
        `${info.nonBlank} rows with data, ${info.blank} blank rows in between or after, last sheet row ${info.lastRow}.`,
        "",
        table(["Col", "Header", "Filled", "Filled %", "Distinct values", "Note"], info.columns),
        ""
      );
      console.log(`${sheet}/${tab}: ${info.nonBlank} rows, ${info.columns.length} columns`);
    } catch (e) {
      summary.push([sheet, tab, "ERROR", "", "", e.message]);
      parts.push(`## ${tab} (${sheet})`, "", `**Could not read:** ${e.message}`, "");
      console.log(`${sheet}/${tab}: ERROR ${e.message}`);
    }
  }
  parts.splice(4, 0, table(["Sheet", "Tab", "Rows with data", "Blank rows", "Columns", "Formulas"], summary), "");
  console.log(`Report: ${writeReport(area, parts.join("\n"), "headers")}`);
}
