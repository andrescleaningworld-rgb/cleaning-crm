// Area 3 import: Subcontractors + Subcontractor Activity Log → Postgres
// (dev branch only; Sheets read-only).
//
//   node scripts/migrate/import-subs.mjs --dry-run
//   node scripts/migrate/import-subs.mjs
//
// Subcontractors have no stable id in Sheets (see 004_subs.sql), so a
// re-import recognises each row in this order:
//   1. same row number and same fingerprint (contact + company + email)  → same sub
//   2. same fingerprint on a different row                              → the row moved; legacy_row_id is updated
//   3. same row number, different fingerprint, old fingerprint gone      → edited in place
//   4. otherwise                                                        → a new sub, next free SUB-NNN
// Nothing is merged and nothing is deleted. Every doubt becomes a row in
// migration_issues. Overrides (migration_overrides, area 'subs'):
//   kind 'sub_alias': legacy_key = a name in lowercase, resolved_id = sub id
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { sha256, startRun, toDate } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("subs", { dryRun });
const { sql } = run;

export const norm = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const fingerprintOf = (contact, company, email) => sha256(norm(contact), norm(company), norm(email));

/** Column index per normalized header; `nth` picks the 1st, 2nd… column with that header. */
function headerIndex(header) {
  const seen = new Map();
  header.forEach((h, i) => {
    const key = norm(h);
    if (key) seen.set(key, [...(seen.get(key) ?? []), i]);
  });
  return (name, nth = 0) => seen.get(name)?.[nth] ?? -1;
}

try {
  /* ---------- Subcontractors ---------- */
  const all = await readTab("MAIN", "Subcontractors", { range: "A:Z" });
  const col = headerIndex(all[0] ?? []);
  const at = (row, name, nth = 0) => {
    const i = col(name, nth);
    return i === -1 ? "" : String(row[i] ?? "");
  };
  // Column A's formula fills an ID whenever Contact Name is filled, so a row
  // with only an ID is still blank for our purposes.
  const sheetRows = all
    .slice(1)
    .map((row, i) => ({ row, sourceRow: i + 2 }))
    .filter(({ row }) => !isBlankRow(row.slice(1)));

  const fromSheet = sheetRows.map(({ row, sourceRow }) => {
    const insuranceRaw = at(row, "insurance expiration date") || at(row, "insurance expiration");
    return {
      sourceRow,
      rowId: `SUB-ROW-${sourceRow}`,
      fingerprint: fingerprintOf(at(row, "contact name"), at(row, "company name"), at(row, "email")),
      fields: {
        display_id_raw: at(row, "subcontractor id"),
        contact_name: at(row, "contact name"),
        company_name: at(row, "company name"),
        address: at(row, "address"),
        phone: at(row, "phone"),
        email: at(row, "email"),
        areas_serviced: at(row, "areas serviced"),
        services_provided: at(row, "services provided"),
        employee_capacity: at(row, "employee capacity"),
        insurance_document_name: at(row, "insurance document name"),
        insurance_expiration: toDate(insuranceRaw),
        insurance_expiration_raw: insuranceRaw,
        status: at(row, "status"),
        notes: at(row, "notes"),
        created_at_raw: at(row, "created at"),
        updated_at_raw: at(row, "updated at"),
        extra_id_raw: at(row, "id"),
        extra_phone_raw: at(row, "phone", 1),
        extra_insurance_raw: col("insurance expiration date") !== -1 ? at(row, "insurance expiration") : "",
      },
    };
  });

  const existing = await sql`SELECT id, legacy_row_id, fingerprint FROM subcontractors`;
  const usedIds = new Set(existing.map((e) => e.id));
  const unclaimed = new Map(existing.map((e) => [e.id, e]));
  const sheetFingerprints = new Set(fromSheet.map((s) => s.fingerprint));

  const nextId = () => {
    let n = Math.max(0, ...[...usedIds].map((id) => Number(/^SUB-(\d+)$/.exec(id)?.[1] ?? 0))) + 1;
    let id = `SUB-${String(n).padStart(3, "0")}`;
    while (usedIds.has(id)) id = `SUB-${String(++n).padStart(3, "0")}`;
    usedIds.add(id);
    return id;
  };

  const stats = { same: 0, moved: 0, editedInPlace: 0, new: 0 };
  const claim = (entry) => {
    unclaimed.delete(entry.id);
    return entry.id;
  };
  // Pass 1: same row and same fingerprint.
  for (const s of fromSheet) {
    const hit = [...unclaimed.values()].find((e) => e.legacy_row_id === s.rowId && e.fingerprint === s.fingerprint);
    if (hit) {
      s.id = claim(hit);
      stats.same++;
    }
  }
  // Pass 2: same fingerprint elsewhere (row moved). With identical twins the
  // first unclaimed one in id order is taken, which keeps their order.
  for (const s of fromSheet.filter((x) => !x.id)) {
    const hit = [...unclaimed.values()].filter((e) => e.fingerprint === s.fingerprint).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (hit) {
      s.id = claim(hit);
      stats.moved++;
      run.issue("subcontractors", hit.id, `Moved in Sheets from ${hit.legacy_row_id} to ${s.rowId} (rows were inserted or deleted above it). Followed automatically; other tabs that still say ${hit.legacy_row_id} now point at a different sub.`);
    }
  }
  // Pass 3: same row, contact/company/email edited, and the old identity is
  // nowhere else in the sheet.
  for (const s of fromSheet.filter((x) => !x.id)) {
    const hit = [...unclaimed.values()].find((e) => e.legacy_row_id === s.rowId && !sheetFingerprints.has(e.fingerprint));
    if (hit) {
      s.id = claim(hit);
      stats.editedInPlace++;
    }
  }
  // Pass 4: new subs. First import: keep the column A number when it is free.
  for (const s of fromSheet.filter((x) => !x.id)) {
    const wanted = s.fields.display_id_raw.trim();
    if (existing.length === 0 && /^SUB-\d+$/.test(wanted) && !usedIds.has(wanted)) {
      s.id = wanted;
      usedIds.add(wanted);
    } else {
      s.id = nextId();
    }
    stats.new++;
  }
  for (const gone of unclaimed.values()) {
    run.issue("subcontractors", gone.id, `Was imported before (as ${gone.legacy_row_id}) but is no longer in Sheets. Not deleted here.`);
  }

  if (!dryRun && fromSheet.length) {
    const columns = Object.keys(fromSheet[0].fields);
    const text =
      `INSERT INTO subcontractors (id, legacy_key, legacy_row_id, fingerprint, ${columns.join(", ")}, source_sheet, source_row, imported_at)
       VALUES ($1, $1, $2, $3, ${columns.map((_, i) => `$${i + 4}`).join(", ")}, 'MAIN', $${columns.length + 4}, now())
       ON CONFLICT (id) DO UPDATE SET legacy_row_id = EXCLUDED.legacy_row_id, fingerprint = EXCLUDED.fingerprint,
         ${columns.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}, source_row = EXCLUDED.source_row, imported_at = now(), updated_at = now()`;
    await sql.transaction([
      // Row ids can swap between subs when rows move; clear them first so the
      // UNIQUE constraint is not hit halfway through.
      sql`UPDATE subcontractors SET legacy_row_id = NULL WHERE source_sheet IS NOT NULL`,
      ...fromSheet.map((s) => sql.query(text, [s.id, s.rowId, s.fingerprint, ...columns.map((c) => s.fields[c]), s.sourceRow])),
    ]);
  }
  run.count("subcontractors", { sheetRows: fromSheet.length, ...stats, goneFromSheets: unclaimed.size });

  /* ---------- Questions about the subcontractor list ---------- */
  const group = (keyOf) => {
    const map = new Map();
    for (const s of fromSheet) {
      const key = keyOf(s);
      if (key) map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map].filter(([, list]) => list.length > 1);
  };
  const describe = (s) => ({ id: s.id, row: s.sourceRow, contact: s.fields.contact_name, company: s.fields.company_name, status: s.fields.status });

  for (const [, list] of group((s) => s.fingerprint)) {
    run.issue("subcontractors", list.map((s) => s.id).join("+"), `${list.length} rows have the same contact, company and email (${list.map((s) => s.id).join(", ")}). Is this one subcontractor entered twice? Both are kept; nothing is merged.`, {
      rawValue: `${list[0].fields.contact_name} / ${list[0].fields.company_name}`,
      candidates: list.map(describe),
    });
  }
  for (const [email, list] of group((s) => norm(s.fields.email))) {
    if (new Set(list.map((s) => s.fingerprint)).size === 1) continue; // already asked above
    run.issue("subcontractors", `email:${email}`, `${list.length} different subcontractors share one email. The sub portal logs in by email, so it cannot tell them apart.`, { candidates: list.map(describe) });
  }
  for (const s of fromSheet) {
    if (!s.fields.phone.trim() && s.fields.extra_phone_raw.trim()) {
      run.issue("subcontractors", s.id, `Phone is only in the second "Phone" column at the far right, which the app never reads, so the app shows no phone for this sub. Move it to the first Phone column?`);
    }
    const stale = s.fields.extra_id_raw.trim();
    if (stale && stale !== s.fields.display_id_raw.trim()) {
      run.issue("subcontractors", s.id, `The far-right "ID" column says ${stale}, but this row is ${s.fields.display_id_raw}. That column looks left over from an old paste; ignored.`, { rawValue: stale });
    }
    const status = s.fields.status.trim();
    if (status && !["Active", "Inactive", "Paused"].includes(status)) {
      run.issue("subcontractors", s.id, `Status "${status}" is not Active, Inactive or Paused. Kept as is.`, { rawValue: status });
    }
  }

  /* ---------- Name aliases ---------- */
  const overrides = await sql`SELECT legacy_key, resolved_id FROM migration_overrides WHERE area = 'subs' AND kind = 'sub_alias'`;
  const overridden = new Map(overrides.map((o) => [norm(o.legacy_key), o.resolved_id]));
  const candidates = new Map(); // alias → Map(subId → source)
  for (const s of fromSheet) {
    for (const [source, value] of [["contact", s.fields.contact_name], ["company", s.fields.company_name]]) {
      const alias = norm(value);
      if (!alias) continue;
      if (!candidates.has(alias)) candidates.set(alias, new Map());
      if (!candidates.get(alias).has(s.id)) candidates.get(alias).set(s.id, source);
    }
  }
  const aliases = [];
  let ambiguous = 0;
  for (const [alias, subs] of candidates) {
    if (overridden.has(alias)) continue;
    if (subs.size === 1) {
      const [[subId, source]] = [...subs];
      aliases.push({ alias, subId, source });
    } else {
      ambiguous++;
      run.issue("sub_name_aliases", alias, `The name "${alias}" fits ${subs.size} subcontractors (${[...subs.keys()].join(", ")}). When another tab says "${alias}", which one is meant? Left unresolved.`, {
        rawValue: alias,
        candidates: fromSheet.filter((s) => subs.has(s.id)).map(describe),
      });
    }
  }
  for (const [alias, subId] of overridden) {
    if (subId && usedIds.has(subId)) aliases.push({ alias, subId, source: "override" });
    else if (subId) run.issue("sub_name_aliases", alias, `Your answer points "${alias}" at ${subId}, which does not exist.`);
  }
  if (!dryRun) {
    await sql.transaction([
      sql`DELETE FROM sub_name_aliases`,
      ...aliases.map((a) => sql`INSERT INTO sub_name_aliases (alias, subcontractor_id, source) VALUES (${a.alias}, ${a.subId}, ${a.source})`),
    ]);
  }
  run.count("sub_name_aliases", { names: candidates.size, stored: aliases.length, ambiguous, fromOverrides: aliases.filter((a) => a.source === "override").length });

  /* ---------- Subcontractor Activity Log ---------- */
  // Same read options as getSubcontractorActivityLog in lib/googleSheets.ts.
  const logRows = (await readTab("MAIN", "Subcontractor Activity Log", { range: "A2:E", unformatted: true }))
    .map((row, i) => ({ row, sourceRow: i + 2 }))
    .filter(({ row }) => !isBlankRow(row));

  const byEmail = new Map();
  for (const s of fromSheet) {
    const email = norm(s.fields.email);
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), s.id]);
  }
  const toLocalTimestamp = (raw) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(raw.trim());
    return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")} ${m[4].padStart(2, "0")}:${m[5]}:${m[6]}` : null;
  };

  const occurrence = new Map();
  const unresolved = new Map(); // email → { rows, why }
  let badTimes = 0;
  const logRecords = logRows.map(({ row, sourceRow }) => {
    const [tsRaw, email, name, action, details] = [0, 1, 2, 3, 4].map((i) => String(row[i] ?? ""));
    // Two identical lines (same second, same action) are two real events:
    // the nth copy gets its own key.
    const base = sha256(tsRaw.trim(), norm(email), action.trim(), details.trim());
    const n = (occurrence.get(base) ?? 0) + 1;
    occurrence.set(base, n);
    const loggedAt = toLocalTimestamp(tsRaw);
    if (!loggedAt) badTimes++;
    const matches = byEmail.get(norm(email)) ?? [];
    if (matches.length !== 1) {
      const entry = unresolved.get(norm(email)) ?? { rows: 0, matches };
      entry.rows++;
      unresolved.set(norm(email), entry);
    }
    return [n === 1 ? base : `${base}#${n}`, loggedAt, tsRaw, matches.length === 1 ? matches[0] : null, email, name, action, details, sourceRow];
  });
  for (const [email, { rows, matches }] of unresolved) {
    run.issue(
      "sub_activity_log",
      `email:${email || "(blank)"}`,
      matches.length > 1
        ? `${rows} log lines belong to an email that ${matches.length} subcontractors share (${matches.join(", ")}). Which one did these? Left unlinked.`
        : `${rows} log lines belong to an email that no subcontractor has now. Left unlinked.`,
      { candidates: matches }
    );
  }
  if (badTimes) run.issue("sub_activity_log", "timestamps", `${badTimes} log lines have a time that is not M/D/YYYY H:MM:SS. Kept as text.`);

  const before = new Set((await sql`SELECT legacy_key FROM sub_activity_log WHERE source_sheet IS NOT NULL`).map((r) => r.legacy_key));
  const seen = new Set(logRecords.map((r) => r[0]));
  const goneLog = [...before].filter((k) => !seen.has(k)).length;
  if (goneLog) run.issue("sub_activity_log", "gone", `${goneLog} log lines imported before are no longer in Sheets. Not deleted here.`);
  if (!dryRun) {
    const text = `INSERT INTO sub_activity_log
        (legacy_key, logged_at, logged_at_raw, subcontractor_id, subcontractor_email, subcontractor_name, action_type, details, source_sheet, source_row, imported_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MAIN', $9, now())
      ON CONFLICT (legacy_key) DO UPDATE SET logged_at = EXCLUDED.logged_at, logged_at_raw = EXCLUDED.logged_at_raw,
        subcontractor_id = EXCLUDED.subcontractor_id, subcontractor_email = EXCLUDED.subcontractor_email,
        subcontractor_name = EXCLUDED.subcontractor_name, action_type = EXCLUDED.action_type, details = EXCLUDED.details,
        source_row = EXCLUDED.source_row, imported_at = now(), updated_at = now()`;
    for (let i = 0; i < logRecords.length; i += 200) {
      await sql.transaction(logRecords.slice(i, i + 200).map((r) => sql.query(text, r)));
    }
  }
  run.count("sub_activity_log", {
    sheetRows: logRows.length,
    imported: logRecords.length,
    new: [...seen].filter((k) => !before.has(k)).length,
    linkedToSub: logRecords.filter((r) => r[3]).length,
    unlinked: logRecords.filter((r) => !r[3]).length,
    goneFromSheets: goneLog,
  });

  /* ---------- DocumentSends (Area 1): resolve SUB-ROW-n now that subs exist ---------- */
  const byRowId = new Map(fromSheet.map((s) => [s.rowId, s]));
  const sends = await sql`SELECT id, subcontractor_id_raw, subcontractor_name, subcontractor_id FROM document_sends`;
  let resolved = 0;
  const sendUpdates = [];
  for (const send of sends) {
    const sub = byRowId.get(send.subcontractor_id_raw.trim());
    // A row id alone is not proof: rows may have moved since the send was
    // logged. Accept it only when the name logged with the send still fits.
    const nameFits = sub && [sub.fields.contact_name, sub.fields.company_name, sub.fields.email].map(norm).includes(norm(send.subcontractor_name));
    if (sub && nameFits) {
      resolved++;
      if (send.subcontractor_id !== sub.id) sendUpdates.push(sql`UPDATE document_sends SET subcontractor_id = ${sub.id}, updated_at = now() WHERE id = ${send.id}`);
    } else {
      run.issue("document_sends", send.id, sub ? `Sent to "${send.subcontractor_name}" at ${send.subcontractor_id_raw}, but that row is now a different subcontractor (${sub.id}). Who was it sent to? Left unlinked.` : `Sent to ${send.subcontractor_id_raw}, which is not a subcontractor row now. Left unlinked.`, {
        rawValue: send.subcontractor_name,
      });
    }
  }
  if (!dryRun && sendUpdates.length) await sql.transaction(sendUpdates);
  run.count("document_sends.subcontractor_id", { rows: sends.length, resolved, unresolved: sends.length - resolved });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
