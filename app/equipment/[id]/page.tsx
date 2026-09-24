"use client";

// One item's page (simple redesign). Big photo + tag + plain status, then
// ONE big main button for whatever the item needs next (Assign, Return,
// Finish repair, Found it, Restore), then the other jobs as big labeled
// buttons (Edit, Move, Mark repair, Retire), then history. Anything that
// changes status asks first. Check-out/return and repairs reuse the existing
// modals and API routes unchanged.
//
// The only page that reads EquipmentCheckouts/EquipmentRepairs per item.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CheckoutReturnModal from "../CheckoutReturnModal";
import RepairModal from "../RepairModal";
import { EquipmentItemReports } from "../EquipmentCheckAdmin";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import type { EquipmentCategory, EquipmentCheckout, EquipmentItem, EquipmentRepair } from "../types";
import {
  BigButton,
  ConfirmDialog,
  EquipmentForm,
  EquipmentPhoto,
  EquipmentShell,
  ErrorNote,
  StatusChip,
  simpleStatus,
  whereLine,
  type TabletFlag,
} from "../ui";

type StatusAction = "retire" | "restore" | "found";

const CONFIRM_TEXT: Record<StatusAction, { title: (name: string) => string; body: string; label: string; tone: "red" | "green" | "primary" }> = {
  retire: {
    title: (name) => `Retire ${name}?`,
    body: "It stops showing on the tablet and in the main list. Its history is kept, and you can restore it later.",
    label: "Retire",
    tone: "red",
  },
  restore: {
    title: (name) => `Restore ${name}?`,
    body: "It goes back into use and shows on the tablet again.",
    label: "Restore",
    tone: "primary",
  },
  found: {
    title: (name) => `Found ${name}?`,
    body: "This clears Lost and adds a note to its history.",
    label: "Found it",
    tone: "green",
  },
};

function when(iso: string): string {
  return iso ? formatCrewDateTime(iso) : "—";
}

export default function EquipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const equipmentId = params.id;

  const [equipment, setEquipment] = useState<EquipmentItem | null>(null);
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [history, setHistory] = useState<EquipmentCheckout[]>([]);
  const [repairs, setRepairs] = useState<EquipmentRepair[]>([]);
  const [flag, setFlag] = useState<TabletFlag | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reportsKey, setReportsKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [modalMode, setModalMode] = useState<"checkout" | "return" | null>(null);
  // "Move" = return, then straight into a new check-out.
  const [moveAfterReturn, setMoveAfterReturn] = useState(false);
  const [repairModal, setRepairModal] = useState<{ mode: "create" } | { mode: "complete"; repair: EquipmentRepair } | null>(null);
  const [confirm, setConfirm] = useState<StatusAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // Returns the fresh item (or null) so "Move" can check it's free again.
  async function loadAll(): Promise<EquipmentItem | null> {
    setLoadError("");
    try {
      const [equipmentRes, categoriesRes, historyRes, repairsRes, healthRes] = await Promise.all([
        fetch(`/api/equipment/${equipmentId}`, { cache: "no-store" }),
        fetch("/api/equipment-categories", { cache: "no-store" }),
        fetch(`/api/equipment/${equipmentId}/checkouts`, { cache: "no-store" }),
        fetch(`/api/equipment/${equipmentId}/repairs`, { cache: "no-store" }),
        fetch("/api/equipment/health", { cache: "no-store" }),
      ]);

      const equipmentData = (await equipmentRes.json()) as { success?: boolean; equipment?: EquipmentItem; error?: string };
      if (!equipmentData.success || !equipmentData.equipment) {
        setLoadError(equipmentData.error || "Equipment not found.");
        return null;
      }
      setEquipment(equipmentData.equipment);

      const categoriesData = (await categoriesRes.json()) as { success?: boolean; categories?: EquipmentCategory[] };
      if (categoriesData.success && Array.isArray(categoriesData.categories)) setCategories(categoriesData.categories);

      const historyData = (await historyRes.json()) as { success?: boolean; checkouts?: EquipmentCheckout[] };
      if (historyData.success && Array.isArray(historyData.checkouts)) setHistory(historyData.checkouts);

      const repairsData = (await repairsRes.json()) as { success?: boolean; repairs?: EquipmentRepair[] };
      if (repairsData.success && Array.isArray(repairsData.repairs)) setRepairs(repairsData.repairs);

      const healthData = (await healthRes.json().catch(() => ({}))) as { success?: boolean; flags?: Record<string, TabletFlag> };
      if (healthData.success && healthData.flags) setFlag(healthData.flags[equipmentId]);
      return equipmentData.equipment;
    } catch {
      setLoadError("No connection. Reload the page.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (equipmentId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId]);

  const categoryName = useMemo(() => {
    if (!equipment) return "";
    return categories.find((c) => c.id === equipment.categoryId)?.name ?? "";
  }, [categories, equipment]);

  const openRepair = repairs.find((r) => r.status === "Open") ?? null;

  async function runStatusAction(action: StatusAction, note: string) {
    setConfirmBusy(true);
    setConfirmError("");
    try {
      const res = await fetch(`/api/equipment/${encodeURIComponent(equipmentId)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setConfirmError(data.error || "Could not save. Try again.");
        return;
      }
      setConfirm(null);
      setReportsKey((k) => k + 1);
      await loadAll();
    } catch {
      setConfirmError("No connection. Try again.");
    } finally {
      setConfirmBusy(false);
    }
  }

  const back = { href: "/equipment", label: "Equipment" };

  if (loading) {
    return (
      <EquipmentShell back={back} title="Equipment">
        <p className="p-8 text-center text-xl text-gray-600">Loading…</p>
      </EquipmentShell>
    );
  }

  if (loadError || !equipment) {
    return (
      <EquipmentShell back={back} title="Equipment">
        <ErrorNote message={loadError || "Equipment not found."} />
      </EquipmentShell>
    );
  }

  if (editing) {
    return (
      <EquipmentShell back={back} title={`Edit ${equipment.name}`}>
        <EquipmentForm
          item={equipment}
          categories={categories}
          onSaved={() => {
            setEditing(false);
            loadAll();
          }}
          onCancel={() => setEditing(false)}
        />
      </EquipmentShell>
    );
  }

  const status = simpleStatus(equipment, flag);
  const isRetired = equipment.status === "Retired";

  // The one main action for right now.
  let mainAction: { icon: string; label: string; tone: "primary" | "green"; onClick: () => void } | null = null;
  if (isRetired) mainAction = { icon: "↩️", label: "Restore", tone: "primary", onClick: () => setConfirm("restore") };
  else if (status === "lost") mainAction = { icon: "🔎", label: "Found it", tone: "green", onClick: () => setConfirm("found") };
  else if (equipment.status === "CheckedOut") mainAction = { icon: "📥", label: "Return", tone: "primary", onClick: () => setModalMode("return") };
  else if (equipment.status === "InRepair" && openRepair) {
    mainAction = { icon: "✅", label: "Finish repair", tone: "green", onClick: () => setRepairModal({ mode: "complete", repair: openRepair }) };
  } else if (equipment.status === "Available") {
    mainAction = { icon: "👤", label: "Assign to someone", tone: "primary", onClick: () => setModalMode("checkout") };
  }

  return (
    <EquipmentShell back={back} title={equipment.name}>
      <section className="flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm sm:flex-row">
        <EquipmentPhoto url={equipment.photoUrl} name={equipment.name} className="h-56 w-full shrink-0 rounded-2xl sm:w-56" />
        <div className="space-y-3">
          {equipment.serialNumber ? <p className="text-4xl font-black text-gray-900">{equipment.serialNumber}</p> : null}
          {categoryName ? <p className="text-lg text-gray-600">{categoryName}</p> : null}
          <StatusChip status={status} />
          <p className={`text-xl ${equipment.overdue ? "font-bold text-red-700" : "text-gray-700"}`}>
            {whereLine(equipment)}
            {equipment.status === "CheckedOut" && equipment.expectedReturnAt ? ` · back by ${equipment.expectedReturnAt}` : ""}
          </p>
          {status === "lost" && flag ? (
            <p className="rounded-xl bg-red-50 px-4 py-2 text-lg font-semibold text-red-800">Reported lost on the tablet · {when(flag.reportedAt)}</p>
          ) : null}
          {flag?.condition === "damaged" ? (
            <p className="rounded-xl bg-amber-50 px-4 py-2 text-lg font-semibold text-amber-900">Reported damaged on the tablet · {when(flag.reportedAt)}</p>
          ) : null}
          {equipment.needsMaintenanceReview ? (
            <p className="rounded-xl bg-amber-50 px-4 py-2 text-lg font-semibold text-amber-900">Flagged for a check when it was returned.</p>
          ) : null}
        </div>
      </section>

      {mainAction ? <BigButton icon={mainAction.icon} label={mainAction.label} tone={mainAction.tone} onClick={mainAction.onClick} className="w-full text-2xl" /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <BigButton icon="✏️" label="Edit" onClick={() => setEditing(true)} />
        {equipment.status === "CheckedOut" ? (
          <BigButton
            icon="🔁"
            label="Move"
            onClick={() => {
              setMoveAfterReturn(true);
              setModalMode("return");
            }}
          />
        ) : null}
        {equipment.status === "Available" ? <BigButton icon="🔧" label="Mark repair" tone="amber" onClick={() => setRepairModal({ mode: "create" })} /> : null}
        {!isRetired ? (
          <BigButton
            icon="🗑️"
            label="Retire"
            tone="red"
            onClick={() => setConfirm("retire")}
            disabled={equipment.status === "CheckedOut" || equipment.status === "InRepair"}
          />
        ) : null}
      </div>
      {!isRetired && (equipment.status === "CheckedOut" || equipment.status === "InRepair") ? (
        <p className="text-base text-gray-500">To retire it, {equipment.status === "CheckedOut" ? "return it" : "finish the repair"} first.</p>
      ) : null}

      <section className="grid gap-4 rounded-3xl bg-white p-5 text-lg shadow-sm sm:grid-cols-3">
        <div>
          <p className="text-base font-bold text-gray-500">Bought on</p>
          <p className="text-gray-900">{equipment.purchaseDate || "—"}</p>
        </div>
        <div>
          <p className="text-base font-bold text-gray-500">Price</p>
          <p className="text-gray-900">{equipment.purchaseCost ? `$${equipment.purchaseCost.toLocaleString()}` : "—"}</p>
        </div>
        <div>
          <p className="text-base font-bold text-gray-500">Notes</p>
          <p className="text-gray-900">{equipment.conditionNotes || "—"}</p>
        </div>
      </section>

      <EquipmentItemReports key={reportsKey} equipmentId={equipment.id} />

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-2xl font-black text-gray-900">Repairs</h2>
        {repairs.length === 0 ? (
          <p className="text-lg text-gray-600">No repairs yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {repairs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-lg">
                <div>
                  <p className="font-bold text-gray-900">{r.description}</p>
                  <p className="text-base text-gray-600">
                    Started {when(r.startedAt)}
                    {r.completedAt ? ` · Done ${when(r.completedAt)}` : ""}
                    {r.performedBy ? ` · ${r.performedBy}` : ""}
                    {r.cost ? ` · $${r.cost.toLocaleString()}` : ""}
                  </p>
                </div>
                {r.status === "Open" ? (
                  <BigButton icon="✅" label="Finish repair" tone="green" onClick={() => setRepairModal({ mode: "complete", repair: r })} />
                ) : (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-base font-bold text-green-800">Done</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-2xl font-black text-gray-900">Who had it</h2>
        {history.length === 0 ? (
          <p className="text-lg text-gray-600">Nobody yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((c) => (
              <li key={c.id} className="py-3 text-lg">
                <p className="font-bold text-gray-900">
                  {c.holderName}
                  {c.accountId ? <span className="font-normal text-gray-600"> · {c.accountId}</span> : null}
                  {c.workOrderNumber ? <span className="font-normal text-gray-600"> · WO {c.workOrderNumber}</span> : null}
                </p>
                <p className="text-base text-gray-600">
                  Out {when(c.checkedOutAt)}
                  {c.signedOutByStaffName ? ` (by ${c.signedOutByStaffName})` : ""} · {c.returnedAt ? `Back ${when(c.returnedAt)}` : "Not returned"}
                  {c.signedInByStaffName ? ` (by ${c.signedInByStaffName})` : ""}
                  {c.conditionAtReturn ? ` · ${c.conditionAtReturn}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modalMode ? (
        <CheckoutReturnModal
          mode={modalMode}
          equipment={equipment}
          onClose={() => {
            setModalMode(null);
            setMoveAfterReturn(false);
          }}
          onDone={async () => {
            const chainCheckout = modalMode === "return" && moveAfterReturn;
            setModalMode(null);
            setMoveAfterReturn(false);
            const fresh = await loadAll();
            // Returned damaged → it's in repair now, so no new check-out.
            if (chainCheckout && fresh?.status === "Available") setModalMode("checkout");
          }}
        />
      ) : null}

      {repairModal?.mode === "create" ? (
        <RepairModal
          mode="create"
          equipment={equipment}
          onClose={() => setRepairModal(null)}
          onDone={() => {
            setRepairModal(null);
            loadAll();
          }}
        />
      ) : repairModal?.mode === "complete" ? (
        <RepairModal
          mode="complete"
          equipment={equipment}
          repair={repairModal.repair}
          onClose={() => setRepairModal(null)}
          onDone={() => {
            setRepairModal(null);
            loadAll();
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={CONFIRM_TEXT[confirm].title(equipment.name)}
          body={CONFIRM_TEXT[confirm].body}
          confirmLabel={CONFIRM_TEXT[confirm].label}
          tone={CONFIRM_TEXT[confirm].tone}
          noteLabel={confirm === "found" ? "Where was it? (optional)" : undefined}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={(note) => runStatusAction(confirm, note)}
          onCancel={() => {
            setConfirm(null);
            setConfirmError("");
          }}
        />
      ) : null}
    </EquipmentShell>
  );
}
