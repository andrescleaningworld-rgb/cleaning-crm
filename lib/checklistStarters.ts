// Ready-made CW Now checklists and the "type one per line" reader. Plain TS,
// safe in the browser. A line ending in ":" starts a new section.

import { buildSectionsFromRows, type ChecklistSectionDef } from "@/lib/checklistTemplate";

export const DEFAULT_SECTION = "Every visit";
export const MAX_LINES = 200;

export type StarterChecklist = { id: string; name: string; icon: string; text: string };

export const STARTER_CHECKLISTS: StarterChecklist[] = [
  {
    id: "office",
    name: "Office cleaning",
    icon: "🏢",
    text: `Offices:
Empty all trash cans
Wipe desks and tables
Dust window sills
Vacuum carpets
Kitchen:
Wipe counters and sink
Clean the microwave
Mop the floor
Restrooms:
Clean toilets and sinks
Fill soap and paper
Mop the floor
Before leaving:
Turn off the lights
Lock the doors`,
  },
  {
    id: "porter",
    name: "Porter",
    icon: "🧹",
    text: `Lobby:
Clean the entrance glass
Empty trash cans
Sweep or mop the floor
Halls:
Pick up trash
Wipe door handles
Clean the elevator
Restrooms:
Check and clean every restroom
Fill soap and paper
Before leaving:
Take trash to the dumpster
Tell the manager about any problem`,
  },
  {
    id: "restrooms",
    name: "Restrooms",
    icon: "🚻",
    text: `Restrooms:
Clean and disinfect toilets
Clean sinks and faucets
Clean the mirrors
Fill soap, paper and toilet paper
Empty trash cans
Wipe stall doors
Mop the floor`,
  },
];

/** What the "See an example" button fills in. */
export const EXAMPLE_CHECKLIST = STARTER_CHECKLISTS[0].text;

type Row = { section: string; item: string };

/** The typed lines as rows. A line ending in ":" names the section for the lines after it. */
export function rowsFromText(text: string): Row[] {
  let section = DEFAULT_SECTION;
  const rows: Row[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!line) continue;
    if (line.endsWith(":")) {
      section = line.slice(0, -1).trim() || DEFAULT_SECTION;
      continue;
    }
    rows.push({ section, item: line });
  }
  return rows.slice(0, MAX_LINES);
}

/** The rows of saved sections, to split them again. */
export const rowsFromSections = (sections: ChecklistSectionDef[]): Row[] => sections.flatMap((section) => section.items.map((item) => ({ section: section.title, item: item.label })));

/** One tab, or one per person: whole sections stay together where they can, about the same work each. */
export function splitForCrew(rows: Row[], people: number): { name: string; sections: ChecklistSectionDef[] }[] | null {
  if (rows.length === 0) return null;
  const count = Math.max(1, Math.min(4, Math.round(people)));
  const bySection = new Map<string, Row[]>();
  for (const row of rows) bySection.set(row.section, [...(bySection.get(row.section) ?? []), row]);
  const buckets: Row[][] = Array.from({ length: count }, () => []);
  const target = Math.ceil(rows.length / count);
  for (const group of [...bySection.values()].sort((a, b) => b.length - a.length)) {
    if (group.length > target && count > 1) {
      // A section too big for one person is shared out line by line.
      for (const row of group) buckets.reduce((low, bucket) => (bucket.length < low.length ? bucket : low)).push(row);
    } else {
      buckets.reduce((low, bucket) => (bucket.length < low.length ? bucket : low)).push(...group);
    }
  }
  const order = [...bySection.keys()];
  const tabs: { name: string; sections: ChecklistSectionDef[] }[] = [];
  for (const [index, bucket] of buckets.entries()) {
    if (bucket.length === 0) continue;
    const sorted = [...bucket].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
    const built = buildSectionsFromRows(sorted);
    if (!built.ok) return null;
    tabs.push({ name: count === 1 ? "Checklist" : `Person ${index + 1}`, sections: built.sections });
  }
  return tabs;
}
