"use client";

// One vehicle. Main screen: photo + plate + driver + mileage, then the oil
// change status ("Oil change due in 400 mi" / overdue) and "Last service:
// Alignment · Sep 10 · 48,200 mi", ONE big "Log service" button, then
// Update mileage / Edit / Retire, then the full service history (newest
// first, filter by type) and mileage readings. Extra reminders live under
// Edit → "Service reminders" (out of the way). Each job opens its own screen
// with one Save. Retire and Restore ask first. Postgres via
// /api/vehicles/[id]; driver names from /api/staff.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Vehicle, VehicleMileageReading, VehicleServiceItem, VehicleServiceLog } from "@/lib/vehiclesDb";
import { SERVICE_TYPES, formatShortDate, isOilChangeItem, todayInCompanyTz } from "@/lib/vehicleDue";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import { BigButton, ConfirmDialog, EquipmentPhoto, EquipmentShell, ErrorNote, PhotoUploadButton, inputClass } from "../../ui";
import { DUE_STYLE, DueDot, VehicleForm, dueForVehicle, formatMiles, lastServiceText, oilDue, useStaffList } from "../vehicleUi";

type Mode = "view" | "edit" | "log" | "mileage" | "items";

type Detail = { vehicle: Vehicle; items: VehicleServiceItem[]; logs: VehicleServiceLog[]; readings: VehicleMileageReading[] };

const SOURCE_LABEL: Record<VehicleMileageReading["source"], string> = { tablet: "Tablet", office: "Office", service: "Service" };

async function postAction(vehicleId: number, body: Record<string, unknown>): Promise<string> {
  try {
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    return data.success ? "" : data.error || "Could not save. Try again.";
  } catch {
    return "No connection. Try again.";
  }
}

export default function VehiclePage() {
  const params = useParams<{ id: string }>();
  const vehicleId = Number(params.id);
  const staff = useStaffList();
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [confirm, setConfirm] = useState<"retire" | "restore" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("All");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, { cache: "no-store" });
      const data = (await res.json()) as { success?: boolean; error?: string } & Partial<Detail>;
      if (!data.success || !data.vehicle) setLoadError(data.error || "Vehicle not found.");
      else setDetail({ vehicle: data.vehicle, items: data.items ?? [], logs: data.logs ?? [], readings: data.readings ?? [] });
    } catch {
      setLoadError("No connection. Reload the page.");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    load();
  }, [load]);

  const back = { href: "/equipment/vehicles", label: "Vehicles" };

  if (loading) {
    return (
      <EquipmentShell back={back} title="Vehicle">
        <p className="p-8 text-center text-xl text-gray-600">Loading…</p>
      </EquipmentShell>
    );
  }
  if (loadError || !detail) {
    return (
      <EquipmentShell back={back} title="Vehicle">
        <ErrorNote message={loadError || "Vehicle not found."} />
      </EquipmentShell>
    );
  }

  const { vehicle, items, logs, readings } = detail;
  const done = async () => {
    setMode("view");
    await load();
    window.scrollTo({ top: 0 });
  };

  if (mode === "edit") {
    return (
      <EquipmentShell back={back} title={`Edit ${vehicle.name}`}>
        <VehicleForm vehicle={vehicle} staff={staff} onSaved={done} onCancel={() => setMode("view")} />
        <button type="button" onClick={() => setMode("items")} className="min-h-[48px] text-lg font-bold text-blue-700 underline">
          Service reminders (oil change and others)
        </button>
      </EquipmentShell>
    );
  }
  if (mode === "log") {
    return (
      <EquipmentShell back={back} title={`Log service · ${vehicle.name}`}>
        <LogServiceForm vehicle={vehicle} items={items.filter((i) => i.active)} onSaved={done} onCancel={() => setMode("view")} />
      </EquipmentShell>
    );
  }
  if (mode === "mileage") {
    return (
      <EquipmentShell back={back} title={`Mileage · ${vehicle.name}`}>
        <MileageForm vehicle={vehicle} onSaved={done} onCancel={() => setMode("view")} />
      </EquipmentShell>
    );
  }
  if (mode === "items") {
    return (
      <EquipmentShell back={back} title={`Service reminders · ${vehicle.name}`}>
        <ServiceItemsEditor vehicleId={vehicle.id} items={items} onChanged={load} onDone={done} />
      </EquipmentShell>
    );
  }

  const oil = oilDue(vehicle, items);
  // Reminders other than oil (only if someone added them under Edit).
  const otherDues = dueForVehicle(vehicle, items).filter(({ item }) => !isOilChangeItem(item));
  const lastLog = logs[0] ?? null;
  const typesInHistory = [
    ...SERVICE_TYPES.filter((t) => logs.some((l) => l.serviceType === t)),
    ...[...new Set(logs.map((l) => l.serviceType))].filter((t) => !(SERVICE_TYPES as readonly string[]).includes(t)),
  ];
  const shownLogs = historyFilter === "All" ? logs : logs.filter((l) => l.serviceType === historyFilter);

  async function runConfirm(action: "retire" | "restore") {
    setConfirmBusy(true);
    setConfirmError("");
    const error = await postAction(vehicle.id, { action });
    setConfirmBusy(false);
    if (error) {
      setConfirmError(error);
      return;
    }
    setConfirm(null);
    await load();
  }

  return (
    <EquipmentShell back={back} title={vehicle.name}>
      <section className="flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm sm:flex-row">
        <EquipmentPhoto url={vehicle.photoUrl} name={vehicle.name} className="h-48 w-full shrink-0 rounded-2xl sm:w-56" />
        <div className="space-y-2 text-xl">
          {vehicle.plate ? <p className="text-4xl font-black text-gray-900">{vehicle.plate}</p> : null}
          {[vehicle.year, vehicle.make, vehicle.model].some(Boolean) ? (
            <p className="text-gray-600">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}</p>
          ) : null}
          <p className="text-gray-800">👤 {vehicle.driverStaffId ? staffName.get(vehicle.driverStaffId) ?? "—" : "No driver"}</p>
          <p className="text-gray-800">
            🔢 {formatMiles(vehicle.currentMileage)}
            {vehicle.mileageUpdatedAt ? <span className="text-base text-gray-500"> · updated {formatCrewDateTime(vehicle.mileageUpdatedAt)}</span> : null}
          </p>
          {vehicle.vin ? <p className="text-base text-gray-500">VIN {vehicle.vin}</p> : null}
          {!vehicle.active ? <p className="rounded-xl bg-gray-200 px-3 py-1 text-lg font-bold text-gray-700">Retired</p> : null}
        </div>
      </section>

      <section className="space-y-2 rounded-3xl bg-white p-5 shadow-sm">
        {oil ? (
          <p className={`flex items-center gap-3 rounded-xl px-4 py-3 text-2xl font-black ${DUE_STYLE[oil.level].row}`}>
            <DueDot level={oil.level} />
            {oil.text}
          </p>
        ) : (
          <p className="text-lg text-gray-600">Oil change reminder is off (Edit → Service reminders).</p>
        )}
        <p className="px-1 text-lg text-gray-700">
          <span className="font-bold">Last service:</span> {lastLog ? lastServiceText(lastLog) : "none logged yet"}
        </p>
        {otherDues.map(({ item, due }) => (
          <p key={item.id} className={`flex items-center gap-3 rounded-xl px-4 py-2 text-base font-semibold ${DUE_STYLE[due.level].row}`}>
            <DueDot level={due.level} />
            {due.text}
          </p>
        ))}
      </section>

      {vehicle.active ? (
        <>
          <BigButton icon="🔧" label="Log service" tone="primary" onClick={() => setMode("log")} className="w-full text-2xl" />
          <div className="grid grid-cols-3 gap-3">
            <BigButton icon="🔢" label="Update mileage" onClick={() => setMode("mileage")} />
            <BigButton icon="✏️" label="Edit" onClick={() => setMode("edit")} />
            <BigButton icon="🗑️" label="Retire" tone="red" onClick={() => setConfirm("retire")} />
          </div>
        </>
      ) : (
        <BigButton icon="↩️" label="Restore" tone="primary" onClick={() => setConfirm("restore")} className="w-full text-2xl" />
      )}

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-2xl font-black text-gray-900">Service history</h2>
        {typesInHistory.length > 1 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {["All", ...typesInHistory].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setHistoryFilter(t)}
                aria-pressed={historyFilter === t}
                className={`min-h-[48px] rounded-full border-2 px-4 text-base font-bold ${
                  historyFilter === t ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
        {shownLogs.length === 0 ? (
          <p className="text-lg text-gray-600">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shownLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-lg">
                <div>
                  <p className="font-bold text-gray-900">{log.serviceType}</p>
                  {log.notes ? <p className="text-gray-800">{log.notes}</p> : null}
                  <p className="text-base text-gray-600">
                    {[
                      formatShortDate(log.doneOn),
                      log.mileage !== null ? formatMiles(log.mileage) : null,
                      log.shop || null,
                      log.cost !== null ? `$${log.cost.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : null,
                      log.createdBy ? `by ${log.createdBy}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {log.receiptUrl ? (
                  <a href={log.receiptUrl} target="_blank" rel="noreferrer" className="min-h-[48px] rounded-xl border-2 border-gray-300 px-4 py-2 text-lg font-bold text-blue-700">
                    🧾 Receipt
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-2xl font-black text-gray-900">Mileage readings</h2>
        {readings.length === 0 ? (
          <p className="text-lg text-gray-600">None yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {readings.map((r) => {
              return (
                <li key={r.id} className="py-2 text-lg">
                  <span className="font-bold text-gray-900">{formatMiles(r.mileage)}</span>
                  <span className="text-gray-600">
                    {" "}
                    · {SOURCE_LABEL[r.source]}
                    {r.staffId && staffName.get(r.staffId) ? ` · ${staffName.get(r.staffId)}` : ""} · {formatCrewDateTime(r.createdAt)}
                  </span>
                  {r.flaggedLower ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-base font-bold text-amber-900">⚠ lower than last — not used</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirm ? (
        <ConfirmDialog
          title={confirm === "retire" ? `Retire ${vehicle.name}?` : `Restore ${vehicle.name}?`}
          body={
            confirm === "retire"
              ? "It stops showing on the tablet and in the Monday email. Its history is kept, and you can restore it later."
              : "It goes back into use, on the tablet and in the Monday email."
          }
          confirmLabel={confirm === "retire" ? "Retire" : "Restore"}
          tone={confirm === "retire" ? "red" : "primary"}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={() => runConfirm(confirm)}
          onCancel={() => {
            setConfirm(null);
            setConfirmError("");
          }}
        />
      ) : null}
    </EquipmentShell>
  );
}

// ─── Log service ─────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  "Oil change": "🛢️",
  Tires: "🛞",
  Alignment: "📐",
  Balancing: "⚖️",
  Brakes: "🛑",
  Repair: "🔧",
  Other: "📝",
};

// Big quick-pick for the type, then date (today), mileage, notes, shop,
// cost, receipt photo. Picking "Oil change" (or any reminder's name) marks
// that reminder done on Save, which restarts its countdown.
function LogServiceForm({
  vehicle,
  items,
  onSaved,
  onCancel,
}: {
  vehicle: Vehicle;
  items: VehicleServiceItem[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [serviceType, setServiceType] = useState("");
  const [doneOn, setDoneOn] = useState(todayInCompanyTz());
  const [mileage, setMileage] = useState(vehicle.currentMileage !== null ? String(vehicle.currentMileage) : "");
  const [notes, setNotes] = useState("");
  const [shop, setShop] = useState("");
  const [cost, setCost] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Quick-picks + any extra reminder added under Edit (so it can be reset).
  const extraReminders = items.filter((i) => !(SERVICE_TYPES as readonly string[]).some((t) => t.toLowerCase() === i.name.trim().toLowerCase()));
  const types = [...SERVICE_TYPES, ...extraReminders.map((i) => i.name)];
  const reminder = items.find((i) => i.name.trim().toLowerCase() === serviceType.toLowerCase()) ?? null;
  const reminderIsDateOnly = reminder !== null && !reminder.intervalMiles && !reminder.intervalMonths;

  async function save() {
    if (!serviceType) {
      setError("Tap what was done first.");
      return;
    }
    setSaving(true);
    const message = await postAction(vehicle.id, {
      action: "logService",
      serviceType,
      notes,
      doneOn,
      mileage,
      shop,
      cost,
      receiptUrl,
      nextDueDate: reminderIsDateOnly ? nextDueDate : "",
    });
    setSaving(false);
    if (message) setError(message);
    else onSaved();
  }

  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-xl font-black text-gray-900">What was done?</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setServiceType(type);
              setError("");
            }}
            aria-pressed={serviceType === type}
            className={`flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border-2 px-3 text-xl font-bold ${
              serviceType === type ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
            }`}
          >
            <span aria-hidden="true">{TYPE_ICON[type] ?? "🔔"}</span>
            {type}
          </button>
        ))}
      </div>
      {reminder ? <p className="text-base font-semibold text-green-700">Saving this restarts the {reminder.name.toLowerCase()} reminder.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Date</span>
          <input type="date" value={doneOn} max={todayInCompanyTz()} onChange={(e) => setDoneOn(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Mileage</span>
          <input type="number" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} className={inputClass} />
        </label>
        {reminderIsDateOnly ? (
          <label className="block sm:col-span-2">
            <span className="text-lg font-bold text-gray-800">Next due date</span>
            <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} className={inputClass} />
          </label>
        ) : null}
        <label className="block sm:col-span-2">
          <span className="text-lg font-bold text-gray-800">Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Front tires replaced" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Shop</span>
          <input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="Where it was done" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Cost ($)</span>
          <input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PhotoUploadButton
          label={receiptUrl ? "Change receipt photo" : "Receipt photo"}
          kind="receipt"
          onUploaded={setReceiptUrl}
          onUploadingChange={setUploading}
          onError={setError}
        />
        {receiptUrl ? (
          <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-lg font-bold text-green-700">
            ✓ Receipt added
          </a>
        ) : null}
      </div>
      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <BigButton label="Cancel" onClick={onCancel} disabled={saving} />
        <BigButton icon="✔" label={saving ? "Saving…" : "Save"} tone="green" onClick={save} disabled={saving || uploading} />
      </div>
    </div>
  );
}

// ─── Update mileage (office) ─────────────────────────────────────────────

function MileageForm({ vehicle, onSaved, onCancel }: { vehicle: Vehicle; onSaved: () => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const typed = value.trim() === "" ? null : Number(value);
  const lower = typed !== null && vehicle.currentMileage !== null && typed < vehicle.currentMileage;

  async function save() {
    setSaving(true);
    const message = await postAction(vehicle.id, { action: "mileage", mileage: value });
    setSaving(false);
    if (message) setError(message);
    else onSaved();
  }

  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-lg text-gray-600">Last: {formatMiles(vehicle.currentMileage)}</p>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        placeholder="Mileage now"
        aria-label="Mileage now"
        className="min-h-[80px] w-full rounded-2xl border-4 border-blue-600 px-5 text-4xl font-black outline-none"
      />
      {lower ? <p className="rounded-xl bg-amber-50 px-4 py-2 text-lg font-semibold text-amber-900">That&apos;s less than last time. Only save if the odometer really shows this.</p> : null}
      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <BigButton label="Cancel" onClick={onCancel} disabled={saving} />
        <BigButton icon="✔" label={saving ? "Saving…" : "Save mileage"} tone="green" onClick={save} disabled={saving || typed === null} />
      </div>
    </div>
  );
}

// ─── Service items ───────────────────────────────────────────────────────

type ItemDraft = {
  name: string;
  intervalMiles: string;
  intervalMonths: string;
  dueDate: string;
  lastDoneDate: string;
  lastDoneMileage: string;
  active: boolean;
};

const itemDraft = (item: VehicleServiceItem | null): ItemDraft => ({
  name: item?.name ?? "",
  intervalMiles: item?.intervalMiles ? String(item.intervalMiles) : "",
  intervalMonths: item?.intervalMonths ? String(item.intervalMonths) : "",
  dueDate: item?.dueDate ?? "",
  lastDoneDate: item?.lastDoneDate ?? "",
  lastDoneMileage: item?.lastDoneMileage !== null && item?.lastDoneMileage !== undefined ? String(item.lastDoneMileage) : "",
  active: item?.active ?? true,
});

function ServiceItemsEditor({
  vehicleId,
  items,
  onChanged,
  onDone,
}: {
  vehicleId: number;
  items: VehicleServiceItem[];
  onChanged: () => Promise<void>;
  onDone: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-lg text-gray-600">
        Set how often each item is due — by miles, by months, or both. For inspection, registration and insurance, leave those empty and set the due date.
        &quot;Last done&quot; is where the countdown starts.
      </p>
      {items.map((item) => (
        <ServiceItemCard key={item.id} vehicleId={vehicleId} item={item} onSaved={onChanged} />
      ))}
      {adding ? (
        <ServiceItemCard
          vehicleId={vehicleId}
          item={null}
          onSaved={async () => {
            setAdding(false);
            await onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <BigButton icon="➕" label="Add an item" onClick={() => setAdding(true)} className="w-full" />
      )}
      <BigButton icon="✔" label="Done" tone="green" onClick={onDone} className="w-full" />
    </div>
  );
}

function ServiceItemCard({
  vehicleId,
  item,
  onSaved,
  onCancel,
}: {
  vehicleId: number;
  item: VehicleServiceItem | null;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<ItemDraft>(() => itemDraft(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (field: keyof ItemDraft) => (value: string) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [field]: value }));
  };
  const dateOnly = !draft.intervalMiles.trim() && !draft.intervalMonths.trim();

  async function save() {
    setSaving(true);
    setError("");
    const message = await postAction(vehicleId, { action: "saveItem", itemId: item?.id ?? null, ...draft });
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setSaved(true);
    await onSaved();
  }

  return (
    <div className={`space-y-3 rounded-3xl bg-white p-5 shadow-sm ${draft.active ? "" : "opacity-70"}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="Item name" aria-label="Item name" className={`${inputClass} mt-0 font-bold`} />
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setDraft((d) => ({ ...d, active: !d.active }));
          }}
          aria-pressed={draft.active}
          className={`min-h-[56px] rounded-xl border-2 px-4 text-lg font-bold ${draft.active ? "border-green-300 bg-green-50 text-green-800" : "border-gray-300 bg-gray-100 text-gray-600"}`}
        >
          {draft.active ? "On" : "Off"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-base font-bold text-gray-600">Every … miles</span>
          <input type="number" inputMode="numeric" value={draft.intervalMiles} onChange={(e) => set("intervalMiles")(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-base font-bold text-gray-600">Every … months</span>
          <input type="number" inputMode="numeric" value={draft.intervalMonths} onChange={(e) => set("intervalMonths")(e.target.value)} className={inputClass} />
        </label>
        {dateOnly ? (
          <label className="block sm:col-span-2">
            <span className="text-base font-bold text-gray-600">Due date</span>
            <input type="date" value={draft.dueDate} onChange={(e) => set("dueDate")(e.target.value)} className={inputClass} />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="text-base font-bold text-gray-600">Last done (date)</span>
              <input type="date" value={draft.lastDoneDate} onChange={(e) => set("lastDoneDate")(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-base font-bold text-gray-600">Last done (mileage)</span>
              <input type="number" inputMode="numeric" value={draft.lastDoneMileage} onChange={(e) => set("lastDoneMileage")(e.target.value)} className={inputClass} />
            </label>
          </>
        )}
      </div>
      <ErrorNote message={error} />
      <div className={`grid gap-3 ${onCancel ? "sm:grid-cols-2" : ""}`}>
        {onCancel ? <BigButton label="Cancel" onClick={onCancel} disabled={saving} /> : null}
        <BigButton icon="✔" label={saving ? "Saving…" : saved ? "Saved" : item ? "Save" : "Add item"} tone={saved ? "plain" : "green"} onClick={save} disabled={saving} />
      </div>
    </div>
  );
}
