"use client";

import { useEffect, useMemo, useState } from "react";

type AdminVisit = {
  sheetRow: number;
  visitId: string;
  accountName: string;
  subEmail: string;
  subName: string;
  visitDate: string;
  arrivalTime: string;
  notes: string;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) { return String(n).padStart(2, "0"); }

function formatVisitDate(ds: string) {
  if (!ds) return "-";
  const [y, m, d] = ds.split("-");
  if (!y || !m || !d) return ds;
  return `${MONTHS[parseInt(m, 10) - 1]?.slice(0, 3) ?? m} ${parseInt(d, 10)}, ${y}`;
}

function formatTime(t: string) {
  if (!t) return "-";
  const [h, min] = t.split(":");
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return t;
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min ?? "00"} ${ampm}`;
}

const EMPTY_ADD = { account: "", subName: "", subEmail: "", date: "", time: "", notes: "" };

export default function SubVisitLog() {
  const [visits, setVisits] = useState<AdminVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(0);

  const [searchAccount, setSearchAccount] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Edit state
  const [editVisit, setEditVisit] = useState<AdminVisit | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editSubName, setEditSubName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete state
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add state
  const [addOpen, setAddOpen] = useState(false);
  const [addFields, setAddFields] = useState(EMPTY_ADD);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [actionMsg, setActionMsg] = useState("");

  // Init year/month client-side to avoid SSR mismatch
  useEffect(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/visits");
      const data = (await res.json()) as { visits?: AdminVisit[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setVisits(data.visits ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load visits");
    } finally {
      setLoading(false);
    }
  }

  const uniqueSubs = useMemo(
    () => [...new Set(visits.map((v) => v.subName).filter(Boolean))].sort(),
    [visits],
  );

  const monthStr = year ? `${year}-${pad(month + 1)}` : "";

  const visitsInMonth = useMemo(
    () => visits.filter((v) => v.visitDate.startsWith(monthStr)),
    [visits, monthStr],
  );

  const visitCountByDay = useMemo(() => {
    const counts = new Map<string, number>();
    visitsInMonth.forEach((v) => {
      if (filterSub && v.subName !== filterSub) return;
      if (searchAccount.trim() && !v.accountName.toLowerCase().includes(searchAccount.toLowerCase())) return;
      counts.set(v.visitDate, (counts.get(v.visitDate) ?? 0) + 1);
    });
    return counts;
  }, [visitsInMonth, filterSub, searchAccount]);

  const visitsFiltered = useMemo(() => {
    let result = visitsInMonth;
    if (selectedDay) result = result.filter((v) => v.visitDate === selectedDay);
    if (searchAccount.trim()) {
      const term = searchAccount.toLowerCase();
      result = result.filter((v) => v.accountName.toLowerCase().includes(term));
    }
    if (filterSub) result = result.filter((v) => v.subName === filterSub);
    return [...result].sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  }, [visitsInMonth, selectedDay, searchAccount, filterSub]);

  // Calendar grid
  const firstDow = year ? new Date(year, month, 1).getDay() : 0;
  const daysInMonth = year ? new Date(year, month + 1, 0).getDate() : 31;
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array<null>(totalCells - firstDow - daysInMonth).fill(null),
  ];

  function ds(day: number) { return `${year}-${pad(month + 1)}-${pad(day)}`; }

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setSelectedDay(null);
  }

  function toggleDay(day: number) {
    const d = ds(day);
    setSelectedDay((prev) => (prev === d ? null : d));
  }

  function openEdit(v: AdminVisit) {
    setEditVisit(v);
    setEditDate(v.visitDate);
    setEditTime(v.arrivalTime);
    setEditNotes(v.notes);
    setEditAccount(v.accountName);
    setEditSubName(v.subName);
    setEditError("");
  }

  async function handleEdit() {
    if (!editVisit || !editDate || !editTime) {
      setEditError("Date and time are required.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch("/api/admin/visits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: editVisit.sheetRow,
          fields: {
            accountName: editAccount,
            subName: editSubName,
            visitDate: editDate,
            arrivalTime: editTime,
            notes: editNotes,
          },
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to save");
      setVisits((prev) =>
        prev.map((v) =>
          v.sheetRow === editVisit.sheetRow
            ? { ...v, visitDate: editDate, arrivalTime: editTime, notes: editNotes, accountName: editAccount, subName: editSubName }
            : v,
        ),
      );
      setEditVisit(null);
      flash("Visit updated.");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(sheetRow: number) {
    if (confirmDeleteRow !== sheetRow) { setConfirmDeleteRow(sheetRow); return; }
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/visits", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to delete");
      setVisits((prev) => prev.filter((v) => v.sheetRow !== sheetRow));
      setConfirmDeleteRow(null);
      flash("Visit deleted.");
    } catch {
      setConfirmDeleteRow(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleAdd() {
    if (!addFields.account.trim() || !addFields.date || !addFields.time) {
      setAddError("Account, date, and time are required.");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await fetch("/api/admin/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: addFields.account.trim(),
          subName: addFields.subName.trim(),
          subEmail: addFields.subEmail.trim(),
          visitDate: addFields.date,
          arrivalTime: addFields.time,
          notes: addFields.notes.trim(),
        }),
      });
      const data = (await res.json()) as { success?: boolean; visitId?: string; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to add");
      // Re-fetch to get correct sheetRow
      await fetchAll();
      setAddOpen(false);
      setAddFields(EMPTY_ADD);
      flash("Visit added.");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAddSaving(false);
    }
  }

  function flash(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(""), 4000);
  }

  const totalThisMonth = visitsInMonth.length;
  const uniqueAccountsThisMonth = new Set(visitsInMonth.map((v) => v.accountName)).size;
  const uniqueSubsThisMonth = new Set(visitsInMonth.map((v) => v.subName)).size;

  return (
    <section className="mt-8">
      {/* Section header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Subcontractor Portal
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Service Visit Log
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Visits logged by subcontractors from the portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setAddOpen(true); setAddError(""); setAddFields(EMPTY_ADD); }}
          className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
        >
          + Add Visit
        </button>
      </div>

      {actionMsg && (
        <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
          {actionMsg}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">
          Loading visit log…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: "Visits This Month", value: totalThisMonth },
              { label: "Accounts", value: uniqueAccountsThisMonth },
              { label: "Subcontractors", value: uniqueSubsThisMonth },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {/* Filters + calendar */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {/* Month nav */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                ‹ Prev
              </button>
              <p className="text-base font-black text-slate-900">
                {year ? `${MONTHS[month]} ${year}` : "…"}
              </p>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Next ›
              </button>
            </div>

            {/* Filter row */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={searchAccount}
                onChange={(e) => { setSearchAccount(e.target.value); setSelectedDay(null); }}
                placeholder="Search account…"
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
              <select
                value={filterSub}
                onChange={(e) => { setFilterSub(e.target.value); setSelectedDay(null); }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              >
                <option value="">All subcontractors</option>
                {uniqueSubs.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {(searchAccount || filterSub || selectedDay) && (
                <button
                  type="button"
                  onClick={() => { setSearchAccount(""); setFilterSub(""); setSelectedDay(null); }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Calendar grid */}
            <div className="mt-5">
              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {DOW.map((d) => (
                  <div key={d} className="py-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, idx) => {
                  if (!day) return <div key={idx} className="h-10 rounded-xl" />;
                  const dateStr = ds(day);
                  const count = visitCountByDay.get(dateStr) ?? 0;
                  const isSelected = selectedDay === dateStr;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={[
                        "relative flex h-10 flex-col items-center justify-center rounded-xl text-sm font-bold transition active:scale-95",
                        isSelected ? "bg-blue-700 text-white" : count > 0 ? "bg-green-100 text-green-800 hover:bg-green-200" : "text-slate-600 hover:bg-slate-100",
                      ].join(" ")}
                    >
                      {day}
                      {count > 0 && (
                        <span className={[
                          "absolute bottom-0.5 text-[9px] font-black leading-none",
                          isSelected ? "text-blue-200" : "text-green-600",
                        ].join(" ")}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDay && (
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Showing {visitsFiltered.length} visit{visitsFiltered.length !== 1 ? "s" : ""} on {formatVisitDate(selectedDay)}.{" "}
                <button type="button" onClick={() => setSelectedDay(null)} className="text-blue-600 underline">
                  Show all
                </button>
              </p>
            )}
          </div>

          {/* Visit list */}
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-black text-slate-900">
                {selectedDay ? `Visits — ${formatVisitDate(selectedDay)}` : `All Visits — ${year ? `${MONTHS[month]} ${year}` : ""}`}
              </h3>
              <span className="text-sm font-semibold text-slate-400">
                {visitsFiltered.length} visit{visitsFiltered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {visitsFiltered.length === 0 ? (
              <p className="text-sm text-slate-400">No visits found for this filter.</p>
            ) : (
              <div className="space-y-3">
                {visitsFiltered.map((v) => (
                  <div
                    key={v.sheetRow}
                    className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                            {formatVisitDate(v.visitDate)}
                          </span>
                          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                            {formatTime(v.arrivalTime)}
                          </span>
                        </div>
                        <p className="mt-1.5 font-bold text-slate-900">{v.accountName || "—"}</p>
                        <p className="text-sm text-slate-500">{v.subName || "—"}{v.subEmail ? ` · ${v.subEmail}` : ""}</p>
                        {v.notes && (
                          <p className="mt-1 text-sm text-slate-600">{v.notes}</p>
                        )}
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(v)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(v.sheetRow)}
                          disabled={deleting && confirmDeleteRow === v.sheetRow}
                          className={[
                            "rounded-xl border px-3 py-1.5 text-xs font-bold transition",
                            confirmDeleteRow === v.sheetRow
                              ? "border-red-400 bg-red-600 text-white"
                              : "border-slate-200 bg-white text-red-600 hover:bg-red-50",
                          ].join(" ")}
                        >
                          {confirmDeleteRow === v.sheetRow ? "Confirm?" : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit modal */}
      {editVisit && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
          onClick={(e) => { if (e.target === e.currentTarget) setEditVisit(null); }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900">Edit Visit</h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700">Account</label>
                <input
                  value={editAccount}
                  onChange={(e) => setEditAccount(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Subcontractor</label>
                <input
                  value={editSubName}
                  onChange={(e) => setEditSubName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Visit Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Arrival Time</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              {editError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {editError}
                </p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditVisit(null)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" onClick={handleEdit} disabled={editSaving}
                  className="flex-1 rounded-xl bg-blue-700 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60">
                  {editSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add visit modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
          onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900">Add Visit</h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700">Account <span className="text-red-500">*</span></label>
                <input
                  value={addFields.account}
                  onChange={(e) => setAddFields((f) => ({ ...f, account: e.target.value }))}
                  placeholder="Account name"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Subcontractor</label>
                <input
                  value={addFields.subName}
                  onChange={(e) => setAddFields((f) => ({ ...f, subName: e.target.value }))}
                  placeholder="Name"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Sub Email (optional)</label>
                <input
                  type="email"
                  value={addFields.subEmail}
                  onChange={(e) => setAddFields((f) => ({ ...f, subEmail: e.target.value }))}
                  placeholder="email@example.com"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Visit Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={addFields.date}
                  onChange={(e) => setAddFields((f) => ({ ...f, date: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Arrival Time <span className="text-red-500">*</span></label>
                <input
                  type="time"
                  value={addFields.time}
                  onChange={(e) => setAddFields((f) => ({ ...f, time: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700">Notes</label>
                <textarea
                  value={addFields.notes}
                  onChange={(e) => setAddFields((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
              {addError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {addError}
                </p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setAddOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="button" onClick={handleAdd} disabled={addSaving}
                  className="flex-1 rounded-xl bg-blue-700 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60">
                  {addSaving ? "Saving…" : "Add Visit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
