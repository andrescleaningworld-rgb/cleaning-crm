// One-time copy of the products in the Supplies page's list (sub_supplies)
// into the Crew Link catalog (supply_items), so crews can order real products.
//
//   node scripts/migrate/copy-supplies-to-catalog.mjs            show the plan; change nothing
//   node scripts/migrate/copy-supplies-to-catalog.mjs --apply    copy what is not there yet
//
// Practice database only (lib/guard.mjs). sub_supplies is only read: nothing
// in it is changed or deleted. The 21 generic catalog items are not touched.
//
// What is copied, per product:
//   name          a short name a crew can read (SHORT_NAMES below, written by
//                 hand from the product's description). A product with no
//                 short name here is NOT copied: the plan lists it, so one
//                 can be written for it first.
//   product code  the product's short supplier name in the Supplies list
//                 (staff only: a crew is never sent it)
//   brand, type   worked out from the words in its name (the lists below)
//   unit          its unit; "case" when it has none
//   photo         its photo, when it has one
// NOT copied: cost, vendor, shelf location, shelf counts, minimum levels.
// Dispensers are left out: they are equipment, not something a crew reorders.
//
// Every copied product arrives REMOVED (hidden) and NOT on the default list
// (migration 036: a new item is off it unless someone switches it on). So no
// crew sees it, and when staff tap "Put back" on it in Supplies -> Catalog
// it still shows only to the accounts it is picked for. Run twice, it adds nothing:
// a product whose code is already in the catalog is skipped.
import { getSql } from "./lib/pg.mjs";

const apply = process.argv.includes("--apply");
const sql = getSql();
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLowerCase();

// First match wins. Checked against the short supplier name and the description together.
const TYPES = [
  // Only a product that IS a dispenser (its name starts with the word), not a towel "for" a dispenser.
  [/^dispenser/i, "Dispensers"],
  [/seat cover/i, "Seat covers"],
  [/urinal/i, "Urinal supplies"],
  [/sani bags?|feminine/i, "Feminine hygiene"],
  [/air freshener/i, "Air freshener"],
  [/virex|disinfect/i, "Disinfectant"],
  [/^tl |liner|lnr /i, "Liners"],
  [/^(hs|hw) |soap|hand ?wash/i, "Soap"],
  [/^(jrt|ttissue) |bath(room)? tissue|toilet tissue|jumbo|apm700/i, "Toilet paper"],
  [/^rt |towel|c-?fold/i, "Hand towels"],
];
/** Types that are not copied at all. */
const LEFT_OUT = new Set(["Dispensers"]);

const BRANDS = [
  [/tork/i, "Tork"],
  [/^rt mega|mega ten/i, "Mega"],
  [/en ?motion|\benm\b/i, "GP enMotion"],
  [/kleenline|\bkl\b/i, "KleenLine"],
  [/dial/i, "Dial"],
  [/provon/i, "Provon"],
  [/gojo/i, "GOJO"],
  [/germ-?x/i, "Germ-X"],
  [/scott/i, "Scott"],
  [/empress/i, "Empress"],
  [/atlas/i, "Atlas"],
  [/society hill/i, "Society Hill"],
  [/green heritage/i, "Green Heritage"],
  [/white pearl/i, "White Pearl"],
  [/big d\b/i, "Big D"],
  [/vectair/i, "Vectair"],
  [/divers/i, "Diversey"],
  [/health guards?/i, "Health Guards"],
];

// The name a crew reads, by the product's short supplier name (its product
// code). Short, plain words; the brand is in its own field and is only
// repeated in a name where two products would otherwise read the same.
const SHORT_NAMES = {
  // Toilet paper
  'JRT JR 9" Empress BT, 2-Ply, Br': 'Jumbo toilet paper 9", 2-ply, septic safe',
  'JRT - 2 Ply - 8.9" D 12/C Br': 'Jumbo toilet paper 8.9", 2-ply',
  "TTissue Atlas 2-Ply Br 96": "Toilet paper rolls, 2-ply, 96 (Atlas)",
  "TTissue KL 2-Ply B+ 96": "Toilet paper rolls, 2-ply, 96 (KleenLine)",
  "JRT JR 2PLY 9X1000' 12CT B+": 'Jumbo toilet paper 9", 2-ply, 1000 ft',
  "TTissue SH 96/C 96": "Toilet paper rolls, 96 (Society Hill)",
  "JRT 2 - Ply B+": "Jumbo toilet paper, 2-ply, 1000 ft (KleenLine)",
  APM700: 'Jumbo toilet paper 9", 2-ply (Green Heritage)',
  "JRT JR 9 2-PLY TT 12/CS 800 B+": 'Jumbo toilet paper 9", 2-ply, 800 ft',
  'JRT JR 9" CS Br': 'Jumbo toilet paper 9"',
  // Hand towels
  'Enm. Roll Towel 8" - Br': 'Roll towel 8", white (enMotion)',
  "RT GP ENM Kraft Roll Br": 'Roll towel 8", kraft (enMotion)',
  'RT ENM 10" 6/C B+': 'Roll towel 10", white (enMotion)',
  'RT ENM 8" B+ 6/C': 'Roll towel 8", brown (enMotion)',
  'RT Mega 10" ENM Disp 6/C Br': 'Roll towel 10" (Mega, for enMotion)',
  "RT Tork Soft Matic 6/C B+": "Roll towel, Matic, white (Tork)",
  "RT KL Hardwound FSC 6/800 B+": "Hardwound roll towel, white, 800 ft (KleenLine)",
  "RT White 12x350 B+": "Roll towel, white, 12 x 350",
  "RT Bleached 6/cs": "Roll towel, bleached, 800 ft",
  "RT HARDWOUND 6/800 W6800 Br": "Hardwound roll towel, white, 800 ft",
  "C-Fold paper B+ 16P/C": "C-fold towels, white",
  // Soap
  "HS Provon 4/C 1250mL B+": "Foam hand soap, antimicrobial (Provon)",
  "HS DIAL 1L - 3/Case B+": "Foam hand soap, 1 L (Dial Complete)",
  "HW DIAL Pro - 1L - 3/Carton Br": "Foam hand soap refill, 1 L, touch-free (Dial Pro)",
  "HS Dial Liquid Soap, Rosemary & Mint 4G/Case": "Liquid hand soap, rosemary and mint, gallon (Dial)",
  "HS GoJo 2x1200mL": "Foam hand soap, 1200 mL (GOJO)",
  "HS WHITE PEARL 4X1 B+": "Hand soap, white pearl",
  "HS PINK LOTION 4X1 B+": "Hand soap, pink lotion",
  "HW GERM-X 2X11 - B+": "Foam hand wash (Germ-X)",
  // Liners
  "TL 38X58 XHD WT Br 100": "Liners 38 x 58, extra heavy",
  "TL 24X33 HD CLR Br 1,000": "Liners 24 x 33, clear, 6 mic",
  "TL 30x37 HD BLCK Br 500": "Liners 30 x 37, black, 16 mic",
  "TL 35X58 LLDPE BLCK B+ 100": "Liners 38 x 58, black, 1.4 mil (KleenLine)",
  "TL KL 30X37 HD BLCK B+ 500": "Liners 30 x 37, black (KleenLine)",
  "TL 30X37 MIC CLR B+ 500": "Liners 30 x 37, clear, 16 mic",
  "TL 24x33 MIC CLR B+ 1000": "Liners 24 x 33, clear, 8 mic (KleenLine)",
  "TL 30X36 XHD BLCK Br": "Liners 30 x 36, black, extra heavy",
  "TL 40x48 HD BLCK Br 150": "Liners 40 x 48, black, 22 mic",
  "TL 24X33 HD MIC Br 1000": "Liners 24 x 33, high density, 6 mic",
  "TL 40x48 HD BLCK B+": "Liners 40 x 48, black, 18 mic",
  "TL 38x58 MIL CLR B+ 100": "Liners 38 x 58, clear, 1 mil (KleenLine)",
  // Seat covers
  "Toilet Seat Cover - Br": "Toilet seat covers, 3000 (Health Guards)",
  "Toilet Seat Cover": "Toilet seat covers, 5000",
  // Urinal supplies
  "Urinal Mat - Br": "Urinal mat",
  "Urinal Screen - Br": "Urinal screen, citrus mango",
  // One each
  "Scott Air Freshener 48 mL 6/c Br": "Air freshener refill, ocean (Scott)",
  "Diversery Virex": "Virex disinfectant",
  "Waxed Sani Bags": "Waxed sanitary bags",
};
const shortNames = new Map(Object.entries(SHORT_NAMES).map(([code, name]) => [key(code), name]));
const firstMatch = (rules, text) => rules.find(([pattern]) => pattern.test(text))?.[1] ?? "";

const products = await sql`SELECT id, supply_item, description, unit, photo_url FROM sub_supplies ORDER BY sheet_row, id`;
const catalog = await sql`SELECT id, name, sku, active FROM supply_items`;
const haveCode = new Set(catalog.map((row) => key(row.sku)).filter(Boolean));
const haveName = new Set(catalog.map((row) => key(row.name)));

const plan = products.map((row) => {
  const code = clean(row.supply_item).slice(0, 60);
  const words = `${code} ${clean(row.description)}`;
  const type = firstMatch(TYPES, words);
  const name = shortNames.get(key(clean(row.supply_item))) ?? "";
  const skip = LEFT_OUT.has(type)
    ? "left out (equipment)"
    : haveCode.has(key(code))
      ? "already copied (its code is in the catalog)"
      : !name
        ? "NO SHORT NAME YET: write one in SHORT_NAMES first"
        : haveName.has(key(name))
          ? "an item with this name is already in the catalog"
          : "";
  return { code, name, was: clean(row.description), unit: clean(row.unit).toLowerCase() || "case", photo: clean(row.photo_url), type, brand: firstMatch(BRANDS, words), skip };
});

// Two products must never read the same to a crew or on an order.
const seen = new Map();
for (const item of plan.filter((entry) => !entry.skip)) {
  if (seen.has(key(item.name))) item.skip = `same short name as "${seen.get(key(item.name))}"`;
  else seen.set(key(item.name), item.code);
}

const before = { items: catalog.length, active: catalog.filter((row) => row.active).length };
console.log(`Catalog before: ${before.items} items (${before.active} that crews can see). Supplies list: ${products.length} products.`);
console.log(apply ? "APPLYING: copying what is not there yet, hidden.\n" : "PLAN ONLY: nothing is changed. Add --apply to copy.\n");

const byType = new Map();
for (const item of plan) byType.set(item.type || "(no type found)", [...(byType.get(item.type || "(no type found)") ?? []), item]);
for (const [type, items] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`== ${type} (${items.length})`);
  for (const item of items) {
    console.log(`  ${item.skip ? "SKIP " : "copy "} ${item.name || "(none)"}`);
    console.log(`         code: ${item.code} | brand: ${item.brand || "-"} | unit: ${item.unit}${item.photo ? " | photo" : ""}${item.skip ? ` | ${item.skip}` : ""}`);
  }
}

const todo = plan.filter((item) => !item.skip);
const longest = Math.max(0, ...todo.map((item) => item.name.length));
console.log(`\nTo copy: ${todo.length}. Skipped: ${plan.length - todo.length}. With no brand found: ${todo.filter((item) => !item.brand).length}. Longest short name: ${longest} characters.`);

if (apply && todo.length > 0) {
  // One transaction: all of them or none. They arrive hidden (active = false), after the items already there.
  // in_default_list is not named: its default is false (off the default list), and it may not exist before migration 036.
  await sql.transaction(
    todo.map(
      (item, index) => sql`
        INSERT INTO supply_items (name, unit, sort_order, active, brand, product_line, photo_url, category, sku, updated_by, updated_at)
        SELECT ${item.name}, ${item.unit}, COALESCE(MAX(sort_order), 0) + 1 + ${index}, false, ${item.brand}, '', ${item.photo}, ${item.type}, ${item.code}, 'copied from the Supplies list', now()
        FROM supply_items
      `
    )
  );
}

if (apply) {
  const after = (await sql`SELECT count(*)::int AS items, count(*) FILTER (WHERE active)::int AS active FROM supply_items`)[0];
  const untouched = (await sql`SELECT count(*)::int AS n FROM sub_supplies`)[0].n;
  console.log(`\nCatalog after: ${after.items} items (${after.active} that crews can see). Copied: ${after.items - before.items}. Supplies list still has ${untouched} products.`);
  // Where there is a default list (migration 036): none of the copied products may be on it.
  const copied = (await sql`SELECT to_jsonb(s) AS row FROM supply_items s WHERE s.updated_by = 'copied from the Supplies list'`).map((entry) => entry.row);
  if (copied.some((row) => "in_default_list" in row)) console.log(`Copied products on the default list: ${copied.filter((row) => row.in_default_list === true).length} (must be 0).`);
}
