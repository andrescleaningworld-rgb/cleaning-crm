"use client";

// Phase 6 (docs/team-hub-spec.md): admin CRUD for the three company-wide
// Team Hub libraries — hub_checklist_library, hub_round_library, and
// supply_items (Team Hub's own catalog, unrenamed per §2 of the spec — NOT
// the Sheets-backed Equipment/Supplies inventory /supplies manages).
// Phase 0 only ever read these three tables; this is the first place an
// admin can add/edit/deactivate them. No delete — an item can already be
// referenced by a crew's item picker or past run history, so "remove" is
// always Deactivate, same convention every other Team Hub admin entity uses.
import Link from "next/link";
import { useEffect, useState } from "react";

type ChecklistItem = { id: number; area: string; text: string; defaultFrequency: "visit" | "weekly" | "monthly"; isNote: boolean; active: boolean };
type RoundItem = { id: number; name: string; defaultIntervalMinutes: number; active: boolean };
type SupplyItem = { id: number; name: string; unit: string; sortOrder: number; active: boolean; equipmentPartId: string | null };

async function callLibraries(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/team-hub/libraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || "Request failed.");
  return data;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-1 text-xs font-semibold ${
        active ? "border-green-200 bg-green-100 text-green-800" : "border-gray-200 bg-gray-100 text-gray-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ChecklistLibrarySection({ items, onChanged }: { items: ChecklistItem[]; onChanged: () => void }) {
  const [area, setArea] = useState("");
  const [text, setText] = useState("");
  const [frequency, setFrequency] = useState<ChecklistItem["defaultFrequency"]>("visit");
  const [isNote, setIsNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ area: string; text: string; defaultFrequency: ChecklistItem["defaultFrequency"] } | null>(null);

  async function handleAdd() {
    if (!area.trim() || !text.trim()) {
      setError("Area and text are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await callLibraries({ type: "checklist", action: "create", area: area.trim(), text: text.trim(), defaultFrequency: frequency, isNote });
      setArea("");
      setText("");
      setFrequency("visit");
      setIsNote(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item: ChecklistItem) {
    try {
      await callLibraries({ type: "checklist", action: "setActive", id: item.id, active: !item.active });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  async function handleSaveEdit() {
    if (!editId || !editDraft) return;
    try {
      await callLibraries({ type: "checklist", action: "update", id: editId, ...editDraft });
      setEditId(null);
      setEditDraft(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item.");
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900">Checklist Library</h2>
      <p className="mt-1 text-sm text-gray-600">
        Company-wide checklist items and pinned notes. Assign which items a crew sees under that crew&apos;s Customize on its account page.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area (e.g. Lobby)" className="rounded-lg border border-gray-300 px-3 py-2 md:col-span-1" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Item text" className="rounded-lg border border-gray-300 px-3 py-2 md:col-span-2" />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as ChecklistItem["defaultFrequency"])} className="rounded-lg border border-gray-300 px-3 py-2">
          <option value="visit">Every visit</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isNote} onChange={(e) => setIsNote(e.target.checked)} />
          Pinned note (not checkable)
        </label>
      </div>
      <button type="button" onClick={handleAdd} disabled={saving} className="mt-3 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
        {saving ? "Adding..." : "Add item"}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="px-3 py-2 font-semibold">Area</th>
              <th className="px-3 py-2 font-semibold">Text</th>
              <th className="px-3 py-2 font-semibold">Frequency</th>
              <th className="px-3 py-2 font-semibold">Note?</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b align-top">
                {editId === item.id && editDraft ? (
                  <>
                    <td className="px-3 py-2"><input value={editDraft.area} onChange={(e) => setEditDraft({ ...editDraft, area: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1" /></td>
                    <td className="px-3 py-2"><input value={editDraft.text} onChange={(e) => setEditDraft({ ...editDraft, text: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1" /></td>
                    <td className="px-3 py-2">
                      <select value={editDraft.defaultFrequency} onChange={(e) => setEditDraft({ ...editDraft, defaultFrequency: e.target.value as ChecklistItem["defaultFrequency"] })} className="rounded border border-gray-300 px-2 py-1">
                        <option value="visit">Every visit</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{item.isNote ? "Yes" : "No"}</td>
                    <td className="px-3 py-2"><StatusBadge active={item.active} /></td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={handleSaveEdit} className="mr-3 font-semibold text-green-700 hover:underline">Save</button>
                      <button type="button" onClick={() => { setEditId(null); setEditDraft(null); }} className="font-semibold text-gray-500 hover:underline">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-semibold text-gray-900">{item.area}</td>
                    <td className="px-3 py-2 text-gray-700">{item.text}</td>
                    <td className="px-3 py-2 text-gray-500">{item.defaultFrequency}</td>
                    <td className="px-3 py-2 text-gray-500">{item.isNote ? "Yes" : "No"}</td>
                    <td className="px-3 py-2"><StatusBadge active={item.active} /></td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => { setEditId(item.id); setEditDraft({ area: item.area, text: item.text, defaultFrequency: item.defaultFrequency }); }} className="mr-3 font-semibold text-blue-700 hover:underline">Edit</button>
                      <button type="button" onClick={() => handleToggle(item)} className="font-semibold text-blue-700 hover:underline">{item.active ? "Deactivate" : "Activate"}</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="p-6 text-center text-gray-600">No checklist items yet.</div>}
      </div>
    </section>
  );
}

function RoundLibrarySection({ items, onChanged }: { items: RoundItem[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [interval, setInterval] = useState(120);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; defaultIntervalMinutes: number } | null>(null);

  async function handleAdd() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await callLibraries({ type: "round", action: "create", name: name.trim(), defaultIntervalMinutes: interval });
      setName("");
      setInterval(120);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add round.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item: RoundItem) {
    try {
      await callLibraries({ type: "round", action: "setActive", id: item.id, active: !item.active });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update round.");
    }
  }

  async function handleSaveEdit() {
    if (!editId || !editDraft) return;
    try {
      await callLibraries({ type: "round", action: "update", id: editId, ...editDraft });
      setEditId(null);
      setEditDraft(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save round.");
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900">Round Library</h2>
      <p className="mt-1 text-sm text-gray-600">Recurring walk-through checks (e.g. restrooms every 2 hours).</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Round name" className="rounded-lg border border-gray-300 px-3 py-2 md:col-span-2" />
        <input type="number" min={1} value={interval} onChange={(e) => setInterval(Number(e.target.value))} placeholder="Interval (minutes)" className="rounded-lg border border-gray-300 px-3 py-2" />
      </div>
      <button type="button" onClick={handleAdd} disabled={saving} className="mt-3 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
        {saving ? "Adding..." : "Add round"}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Interval (min)</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                {editId === item.id && editDraft ? (
                  <>
                    <td className="px-3 py-2"><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1" /></td>
                    <td className="px-3 py-2"><input type="number" min={1} value={editDraft.defaultIntervalMinutes} onChange={(e) => setEditDraft({ ...editDraft, defaultIntervalMinutes: Number(e.target.value) })} className="w-24 rounded border border-gray-300 px-2 py-1" /></td>
                    <td className="px-3 py-2"><StatusBadge active={item.active} /></td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={handleSaveEdit} className="mr-3 font-semibold text-green-700 hover:underline">Save</button>
                      <button type="button" onClick={() => { setEditId(null); setEditDraft(null); }} className="font-semibold text-gray-500 hover:underline">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-semibold text-gray-900">{item.name}</td>
                    <td className="px-3 py-2 text-gray-500">{item.defaultIntervalMinutes}</td>
                    <td className="px-3 py-2"><StatusBadge active={item.active} /></td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => { setEditId(item.id); setEditDraft({ name: item.name, defaultIntervalMinutes: item.defaultIntervalMinutes }); }} className="mr-3 font-semibold text-blue-700 hover:underline">Edit</button>
                      <button type="button" onClick={() => handleToggle(item)} className="font-semibold text-blue-700 hover:underline">{item.active ? "Deactivate" : "Activate"}</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="p-6 text-center text-gray-600">No rounds yet.</div>}
      </div>
    </section>
  );
}

function SupplyLibrarySection({ items, onChanged }: { items: SupplyItem[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("case");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; unit: string } | null>(null);

  async function handleAdd() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await callLibraries({ type: "supply", action: "create", name: name.trim(), unit: unit.trim() || "unit", sortOrder: items.length, equipmentPartId: null });
      setName("");
      setUnit("case");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item: SupplyItem) {
    try {
      await callLibraries({ type: "supply", action: "setActive", id: item.id, active: !item.active });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  async function handleSaveEdit() {
    if (!editId || !editDraft) return;
    try {
      await callLibraries({ type: "supply", action: "update", id: editId, ...editDraft });
      setEditId(null);
      setEditDraft(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item.");
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900">Team Hub Supply Items</h2>
      <p className="mt-1 text-sm text-gray-600">
        The catalog crews order from in &quot;Order supplies.&quot; Separate from the main Equipment/Supplies inventory on the{" "}
        <Link href="/supplies" className="text-blue-700 hover:underline">Supplies page</Link>.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="rounded-lg border border-gray-300 px-3 py-2 md:col-span-2" />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (e.g. case)" className="rounded-lg border border-gray-300 px-3 py-2" />
      </div>
      <button type="button" onClick={handleAdd} disabled={saving} className="mt-3 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
        {saving ? "Adding..." : "Add item"}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Unit</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                {editId === item.id && editDraft ? (
                  <>
                    <td className="px-3 py-2"><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1" /></td>
                    <td className="px-3 py-2"><input value={editDraft.unit} onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })} className="w-24 rounded border border-gray-300 px-2 py-1" /></td>
                    <td className="px-3 py-2"><StatusBadge active={item.active} /></td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={handleSaveEdit} className="mr-3 font-semibold text-green-700 hover:underline">Save</button>
                      <button type="button" onClick={() => { setEditId(null); setEditDraft(null); }} className="font-semibold text-gray-500 hover:underline">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-semibold text-gray-900">{item.name}</td>
                    <td className="px-3 py-2 text-gray-500">{item.unit}</td>
                    <td className="px-3 py-2"><StatusBadge active={item.active} /></td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => { setEditId(item.id); setEditDraft({ name: item.name, unit: item.unit }); }} className="mr-3 font-semibold text-blue-700 hover:underline">Edit</button>
                      <button type="button" onClick={() => handleToggle(item)} className="font-semibold text-blue-700 hover:underline">{item.active ? "Deactivate" : "Activate"}</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="p-6 text-center text-gray-600">No supply items yet.</div>}
      </div>
    </section>
  );
}

export default function TeamHubLibrariesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [rounds, setRounds] = useState<RoundItem[]>([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team-hub/libraries", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load libraries.");
      setChecklist(data.checklist ?? []);
      setRounds(data.rounds ?? []);
      setSupplies(data.supplies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load libraries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link href="/settings" className="text-sm font-semibold text-blue-700 hover:underline">← Back to Settings</Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Team Hub Libraries</h1>
          <p className="mt-1 text-gray-600">
            Company-wide checklist items, rounds, and supply items available to every Team Hub crew. Assign which ones a
            specific crew sees under that crew&apos;s Customize on its account page.
          </p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

        {loading ? (
          <p className="text-gray-600">Loading...</p>
        ) : (
          <div className="grid gap-6">
            <ChecklistLibrarySection items={checklist} onChanged={load} />
            <RoundLibrarySection items={rounds} onChanged={load} />
            <SupplyLibrarySection items={supplies} onChanged={load} />
          </div>
        )}
      </div>
    </main>
  );
}
