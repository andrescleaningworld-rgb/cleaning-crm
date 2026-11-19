"use client";

// One checklist's sections and items, editable: section names, ↑ ↓ and
// Remove Section; each item's label and note, ★ must do, ↑ ↓ ✕; "+ Add Item"
// per section. Used by the Crew Link editor (ChecklistTemplateEditor, the
// active tab) and by "Build from estimate" (ChecklistEstimateBuilder, each
// new tab before Save), so both edit a checklist the same way.

import { slugifyKey, type ChecklistItemDef, type ChecklistSectionDef } from "@/lib/checklistTemplate";

/** Route tab fields on an item, as short tags ("6:00", "Mon", "📷 Photo"). */
function routeTags(item: ChecklistItemDef): string[] {
  return [
    item.time ?? "",
    item.days ?? "",
    item.slot ? `Slot: ${item.slot}` : "",
    item.photo ? "📷 Photo needed" : "",
    item.choices?.length ? `Buttons: ${item.choices.join(", ")}` : "",
    item.kind === "urgent" ? "⚡ Urgent request button" : "",
    item.kind === "night_note" ? "📝 Note for night crew" : "",
    item.es ? `ES: ${item.es}` : "",
  ].filter(Boolean);
}

export function makeEmptySection(): ChecklistSectionDef {
  return { key: slugifyKey(`section-${Date.now()}`), title: "New Section", items: [] };
}

function makeEmptyItem(): ChecklistItemDef {
  return { key: `${slugifyKey(`item-${Date.now()}-${Math.random()}`)}`, label: "New item", subNote: "" };
}

export function moveInArray<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function ChecklistSectionsEditor({
  sections,
  onChange,
  photoMode = false,
}: {
  sections: ChecklistSectionDef[];
  onChange: (update: (prev: ChecklistSectionDef[]) => ChecklistSectionDef[]) => void;
  /** The account's crew screen is the Photo Checklist: each item shows "Photo required? Yes / No" (Yes unless set). */
  photoMode?: boolean;
}) {
  function updateSectionTitle(sectionIndex: number, title: string) {
    onChange((prev) => prev.map((s, i) => (i === sectionIndex ? { ...s, title } : s)));
  }

  function updateItem(sectionIndex: number, itemIndex: number, patch: Partial<ChecklistItemDef>) {
    onChange((prev) =>
      prev.map((s, i) =>
        i === sectionIndex ? { ...s, items: s.items.map((it, j) => (j === itemIndex ? { ...it, ...patch } : it)) } : s
      )
    );
  }

  function removeSection(sectionIndex: number) {
    onChange((prev) => prev.filter((_, i) => i !== sectionIndex));
  }

  function moveSection(sectionIndex: number, direction: -1 | 1) {
    onChange((prev) => moveInArray(prev, sectionIndex, direction));
  }

  function addItem(sectionIndex: number) {
    onChange((prev) => prev.map((s, i) => (i === sectionIndex ? { ...s, items: [...s.items, makeEmptyItem()] } : s)));
  }

  function removeItem(sectionIndex: number, itemIndex: number) {
    onChange((prev) => prev.map((s, i) => (i === sectionIndex ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s)));
  }

  function moveItem(sectionIndex: number, itemIndex: number, direction: -1 | 1) {
    onChange((prev) => prev.map((s, i) => (i === sectionIndex ? { ...s, items: moveInArray(s.items, itemIndex, direction) } : s)));
  }

  return (
    <div className="space-y-6">
      {sections.map((section, sectionIndex) => (
        <div key={section.key} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <input
              value={section.title}
              onChange={(event) => updateSectionTitle(sectionIndex, event.target.value)}
              aria-label="Section name"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black uppercase tracking-wide text-slate-700 outline-none focus:border-blue-500"
            />
            <button type="button" onClick={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0} aria-label="Move section up" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === sections.length - 1} aria-label="Move section down" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => removeSection(sectionIndex)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">
              Remove Section
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {section.items.map((item, itemIndex) => (
              <div key={item.key} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2">
                <div className="flex-1 space-y-1">
                  <input
                    value={item.label}
                    onChange={(event) => updateItem(sectionIndex, itemIndex, { label: event.target.value })}
                    placeholder="Item label"
                    aria-label="Item"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
                  />
                  <input
                    value={item.subNote ?? ""}
                    onChange={(event) => updateItem(sectionIndex, itemIndex, { subNote: event.target.value })}
                    placeholder="Optional guidance note for the porter…"
                    aria-label="Note"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 outline-none focus:border-blue-500"
                  />
                  {/* Route fields come from the uploaded file and are kept when you save here. */}
                  {routeTags(item).length ? (
                    <p className="flex flex-wrap gap-1 text-xs font-bold text-blue-800">
                      {routeTags(item).map((tag) => (
                        <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {/* The crew sees it at the top with a star. */}
                  <button
                    type="button"
                    aria-pressed={item.mustDo === true}
                    onClick={() => updateItem(sectionIndex, itemIndex, { mustDo: item.mustDo ? undefined : true })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black ${item.mustDo ? "bg-amber-400 text-slate-900" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  >
                    ★ {item.mustDo ? "Must do every night" : "Mark as must do every night"}
                  </button>
                  {/* Photo Checklist: does the crew need a photo to check it off? (No = one tap) */}
                  {photoMode && section.title.trim().toLowerCase() !== "rules" ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-black text-slate-600">
                      📷 Photo required?
                      {[true, false].map((required) => (
                        <button
                          key={String(required)}
                          type="button"
                          aria-pressed={(item.noPhoto !== true) === required}
                          onClick={() => updateItem(sectionIndex, itemIndex, { noPhoto: required ? undefined : true })}
                          className={`rounded-lg px-3 py-1.5 ${(item.noPhoto !== true) === required ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                        >
                          {required ? "Yes" : "No"}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, -1)} disabled={itemIndex === 0} aria-label="Move item up" className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, 1)} disabled={itemIndex === section.items.length - 1} aria-label="Move item down" className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" onClick={() => removeItem(sectionIndex, itemIndex)} aria-label="Delete item" className="rounded-lg border border-red-200 px-2 py-0.5 text-xs font-bold text-red-600 hover:bg-red-50">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => addItem(sectionIndex)}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            + Add Item
          </button>
        </div>
      ))}
    </div>
  );
}
