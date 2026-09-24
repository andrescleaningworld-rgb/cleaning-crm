"use client";

// Staff & PINs (Equipment redesign) — the Staff roster used for equipment
// sign-off plus each person's tablet PIN, as big cards. Moved here from
// app/settings/equipment-categories/page.tsx (which now renders this same
// component), same /api/staff and /api/equipment-pins routes, same rules:
// only Active Manager/Office Staff can sign a checkout or return; Delete is
// refused by the API if the person has sign-off history.
import { Fragment, useEffect, useState } from "react";
import type { Staff, StaffRole } from "./types";
import { StaffEquipmentReports, StaffPinControls, useEquipmentPinStatuses } from "./EquipmentCheckAdmin";
import { BigButton, ConfirmDialog, ErrorNote } from "./ui";

const ROLE_OPTIONS: StaffRole[] = ["Manager", "OfficeStaff", "InsideStaff"];
const ROLE_LABELS: Record<StaffRole, string> = { Manager: "Manager", OfficeStaff: "Office Staff", InsideStaff: "Inside Staff" };

const fieldClass = "min-h-[56px] rounded-xl border-2 border-gray-300 px-4 text-xl text-gray-900 outline-none focus:border-blue-600";

export default function StaffManager() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("InsideStaff");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Staff | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const equipmentPins = useEquipmentPinStatuses();
  const [historyStaffId, setHistoryStaffId] = useState<string | null>(null);

  async function loadStaff() {
    setLoadError("");
    try {
      const response = await fetch("/api/staff", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; staff?: Staff[]; error?: string };
      if (!data.success || !Array.isArray(data.staff)) {
        setLoadError(data.error || "Could not load staff.");
        return;
      }
      setStaff(data.staff);
    } catch {
      setLoadError("No connection. Reload the page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, []);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      setActionError("Type a name first.");
      return;
    }
    setAdding(true);
    setActionError("");
    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role: newRole, active: true }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setActionError(data.error || "Could not add. Try again.");
        return;
      }
      setNewName("");
      setNewRole("InsideStaff");
      await loadStaff();
    } catch {
      setActionError("No connection. Try again.");
    } finally {
      setAdding(false);
    }
  }

  async function patchStaff(member: Staff, body: Partial<Pick<Staff, "role" | "active">>) {
    setSavingId(member.id);
    setActionError("");
    try {
      const response = await fetch(`/api/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setActionError(data.error || "Could not save. Try again.");
        return;
      }
      await loadStaff();
    } catch {
      setActionError("No connection. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSavingId(deleting.id);
    setDeleteError("");
    try {
      const response = await fetch(`/api/staff/${deleting.id}`, { method: "DELETE" });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!data.success) {
        setDeleteError(data.error || "Could not delete.");
        return;
      }
      setDeleting(null);
      await loadStaff();
    } catch {
      setDeleteError("No connection. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black text-gray-900">Add a person</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            className={fieldClass}
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as StaffRole)} aria-label="Role" className={fieldClass}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <BigButton icon="➕" label={adding ? "Adding…" : "Add"} tone="green" onClick={handleAdd} disabled={adding} />
        </div>
        <p className="text-base text-gray-600">Only Managers and Office Staff can sign equipment out or back in.</p>
      </section>

      <ErrorNote message={loadError || actionError} />

      {loading ? (
        <p className="p-8 text-center text-xl text-gray-600">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-xl text-gray-600 shadow-sm">Nobody yet — add someone above.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {staff.map((member) => (
            <Fragment key={member.id}>
              <div className={`space-y-4 rounded-3xl border-4 bg-white p-5 shadow-sm ${member.active ? "border-transparent" : "border-gray-200 opacity-80"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-2xl font-black text-gray-900">{member.name}</p>
                  <span
                    className={`rounded-full border px-3 py-1 text-base font-bold ${
                      member.active ? "border-green-300 bg-green-100 text-green-800" : "border-gray-300 bg-gray-100 text-gray-600"
                    }`}
                  >
                    {member.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <label className="block">
                  <span className="text-base font-bold text-gray-500">Role</span>
                  <select
                    value={member.role}
                    onChange={(e) => patchStaff(member, { role: e.target.value as StaffRole })}
                    disabled={savingId === member.id}
                    className={`mt-1 w-full ${fieldClass} disabled:opacity-60`}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <p className="text-base font-bold text-gray-500">Tablet PIN</p>
                  <div className="mt-1">
                    <StaffPinControls
                      member={member}
                      pin={equipmentPins.pins[member.id]}
                      linkPath={equipmentPins.linkPath}
                      onChanged={equipmentPins.reload}
                      historyOpen={historyStaffId === member.id}
                      onToggleHistory={() => setHistoryStaffId((current) => (current === member.id ? null : member.id))}
                      big
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <BigButton
                    label={member.active ? "Deactivate" : "Activate"}
                    onClick={() => patchStaff(member, { active: !member.active })}
                    disabled={savingId === member.id}
                  />
                  <BigButton
                    icon="🗑️"
                    label="Delete"
                    tone="red"
                    onClick={() => {
                      setDeleteError("");
                      setDeleting(member);
                    }}
                    disabled={savingId === member.id}
                  />
                </div>
              </div>
              {historyStaffId === member.id ? (
                <div className="rounded-3xl bg-white p-5 shadow-sm md:col-span-2">
                  <p className="mb-2 text-xl font-black text-gray-900">{member.name} — tablet reports</p>
                  <StaffEquipmentReports staffId={member.id} />
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
      )}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          body="This can't be undone. If they ever signed equipment out or in, use Deactivate instead."
          confirmLabel="Delete"
          tone="red"
          busy={savingId === deleting.id}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
