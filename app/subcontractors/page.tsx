"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Subcontractor = {
  id?: string;
  ID?: string;
  subcontractorId?: string;

  companyName?: string;
  CompanyName?: string;
  company?: string;

  contactName?: string;
  ContactName?: string;

  phone?: string;
  Phone?: string;

  email?: string;
  Email?: string;

  address?: string;
  Address?: string;

  areasServiced?: string;
  AreasServiced?: string;

  servicesProvided?: string;
  ServicesProvided?: string;

  employeeCapacity?: string;
  EmployeeCapacity?: string;

  insuranceExpiration?: string;
  InsuranceExpiration?: string;

  status?: string;
  Status?: string;

  score?: string;
  Score?: string;

  complaints?: string;
  Complaints?: string;

  avgCondition?: string;
  AvgCondition?: string;
  "Avg Condition"?: string;

  accountsAssigned?: string;
  AccountsAssigned?: string;
  "Accounts Assigned"?: string;

  lastReview?: string;
  LastReview?: string;
  "Last Review"?: string;

  notes?: string;
  Notes?: string;
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: Subcontractor[];
  data?: Subcontractor[];
};

function getSubId(sub: Subcontractor) {
  return sub.id || sub.ID || sub.subcontractorId || "";
}

function getCompanyName(sub: Subcontractor) {
  return sub.companyName || sub.CompanyName || sub.company || "Unnamed Subcontractor";
}

function getContactName(sub: Subcontractor) {
  return sub.contactName || sub.ContactName || "";
}

function getPhone(sub: Subcontractor) {
  return sub.phone || sub.Phone || "";
}

function getEmail(sub: Subcontractor) {
  return sub.email || sub.Email || "";
}

function getStatus(sub: Subcontractor) {
  return sub.status || sub.Status || "Active";
}

function getScore(sub: Subcontractor) {
  return sub.score || sub.Score || "";
}

function getComplaints(sub: Subcontractor) {
  return sub.complaints || sub.Complaints || "";
}

function getAvgCondition(sub: Subcontractor) {
  return sub.avgCondition || sub.AvgCondition || sub["Avg Condition"] || "";
}

function getAccountsAssigned(sub: Subcontractor) {
  return (
    sub.accountsAssigned ||
    sub.AccountsAssigned ||
    sub["Accounts Assigned"] ||
    ""
  );
}

function getScoreStatus(scoreValue: string) {
  const score = Number(scoreValue);

  if (!scoreValue || Number.isNaN(score)) {
    return {
      label: "Not Scored",
      className: "bg-slate-100 text-slate-700",
    };
  }

  if (score >= 9) {
    return {
      label: "Excellent",
      className: "bg-green-100 text-green-800",
    };
  }

  if (score >= 8) {
    return {
      label: "Good",
      className: "bg-blue-100 text-blue-800",
    };
  }

  if (score >= 7) {
    return {
      label: "Needs Attention",
      className: "bg-yellow-100 text-yellow-800",
    };
  }

  return {
    label: "High Risk",
    className: "bg-red-100 text-red-800",
  };
}

function getLoadedSubcontractors(
  data: SubcontractorsApiResponse | Subcontractor[]
) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.subcontractors)) return data.subcontractors;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function SubcontractorsPage() {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    areasServiced: "",
    servicesProvided: "",
    employeeCapacity: "",
    insuranceExpiration: "",
    status: "Active",
    score: "",
    complaints: "",
    avgCondition: "",
    accountsAssigned: "",
    lastReview: "",
    notes: "",
  });

  async function loadSubcontractors() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/subcontractors", {
        cache: "no-store",
      });

      const data = (await res.json()) as SubcontractorsApiResponse | Subcontractor[];

      if (!res.ok || (!Array.isArray(data) && data.success === false)) {
        throw new Error(
          !Array.isArray(data) && data.error
            ? data.error
            : "Failed to load subcontractors."
        );
      }

      setSubcontractors(getLoadedSubcontractors(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubcontractors();
  }, []);

  const filteredSubcontractors = useMemo(() => {
    const q = search.toLowerCase().trim();

    if (!q) return subcontractors;

    return subcontractors.filter((sub) => {
      return [
        getCompanyName(sub),
        getContactName(sub),
        getPhone(sub),
        getEmail(sub),
        getStatus(sub),
        getScore(sub),
        getAvgCondition(sub),
        getScoreStatus(getScore(sub)).label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [subcontractors, search]);

  function updateForm(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addSubcontractor",
          ...form,
        }),
      });

      const data = (await res.json()) as SubcontractorsApiResponse;

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to save subcontractor.");
      }

      setSuccessMessage("Subcontractor saved successfully.");

      setForm({
        companyName: "",
        contactName: "",
        phone: "",
        email: "",
        address: "",
        areasServiced: "",
        servicesProvided: "",
        employeeCapacity: "",
        insuranceExpiration: "",
        status: "Active",
        score: "",
        complaints: "",
        avgCondition: "",
        accountsAssigned: "",
        lastReview: "",
        notes: "",
      });

      setShowForm(false);
      await loadSubcontractors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Subcontractors</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                View, score, add, and manage Cleaning World subcontractors.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowForm((prev) => !prev)}
              className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {showForm ? "Cancel" : "Add New Subcontractor"}
            </button>
          </div>

          <div className="mt-5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subcontractors..."
              className="min-h-[48px] w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600 sm:text-sm"
            />
          </div>

          {successMessage && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-white p-5 shadow-sm sm:p-6"
          >
            <h2 className="text-lg font-bold">Add New Subcontractor</h2>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold">Company Name</label>
                <input
                  value={form.companyName}
                  onChange={(e) => updateForm("companyName", e.target.value)}
                  required
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Contact Name</label>
                <input
                  value={form.contactName}
                  onChange={(e) => updateForm("contactName", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Areas Serviced</label>
                <input
                  value={form.areasServiced}
                  onChange={(e) => updateForm("areasServiced", e.target.value)}
                  placeholder="Example: Bergen, Essex, Hudson"
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Services Provided
                </label>
                <input
                  value={form.servicesProvided}
                  onChange={(e) =>
                    updateForm("servicesProvided", e.target.value)
                  }
                  placeholder="Example: Janitorial, floor work, carpet"
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Employee Capacity
                </label>
                <input
                  value={form.employeeCapacity}
                  onChange={(e) =>
                    updateForm("employeeCapacity", e.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Insurance Expiration
                </label>
                <input
                  type="date"
                  value={form.insuranceExpiration}
                  onChange={(e) =>
                    updateForm("insuranceExpiration", e.target.value)
                  }
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => updateForm("status", e.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold">Performance Score</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Use a simple 0–10 score to track subcontractor performance.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-5">
                <div>
                  <label className="text-sm font-semibold">Score</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={form.score}
                    onChange={(e) => updateForm("score", e.target.value)}
                    placeholder="8.5"
                    className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">Complaints</label>
                  <input
                    type="number"
                    min="0"
                    value={form.complaints}
                    onChange={(e) => updateForm("complaints", e.target.value)}
                    placeholder="0"
                    className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">
                    Avg Condition
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={form.avgCondition}
                    onChange={(e) =>
                      updateForm("avgCondition", e.target.value)
                    }
                    placeholder="8.0"
                    className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">
                    Accounts Assigned
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.accountsAssigned}
                    onChange={(e) =>
                      updateForm("accountsAssigned", e.target.value)
                    }
                    placeholder="12"
                    className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">Last Review</label>
                  <input
                    type="date"
                    value={form.lastReview}
                    onChange={(e) => updateForm("lastReview", e.target.value)}
                    className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-semibold">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base sm:text-sm"
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Subcontractor"}
              </button>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">Current Subcontractors</h2>
            <p className="text-sm text-slate-600">
              {filteredSubcontractors.length} shown
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600">Loading subcontractors...</p>
          ) : filteredSubcontractors.length === 0 ? (
            <p className="text-sm text-slate-600">No subcontractors found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-700">
                    <th className="px-4 py-3 font-semibold">Company</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Score</th>
                    <th className="px-4 py-3 font-semibold">
                      Avg Condition
                    </th>
                    <th className="px-4 py-3 font-semibold">Performance</th>
                    <th className="px-4 py-3 font-semibold">Complaints</th>
                    <th className="px-4 py-3 font-semibold">Accounts</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSubcontractors.map((sub, index) => {
                    const id = getSubId(sub);
                    const safeId = encodeURIComponent(id);
                    const score = getScore(sub);
                    const avgCondition = getAvgCondition(sub);
                    const scoreStatus = getScoreStatus(score);

                    return (
                      <tr
                        key={id || `${getCompanyName(sub)}-${index}`}
                        className="border-b last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-semibold">
                          {id ? (
                            <Link
                              href={`/subcontractors/${safeId}`}
                              className="text-blue-700 hover:underline"
                            >
                              {getCompanyName(sub)}
                            </Link>
                          ) : (
                            getCompanyName(sub)
                          )}
                        </td>

                        <td className="px-4 py-3">{getContactName(sub)}</td>
                        <td className="px-4 py-3">{getPhone(sub)}</td>

                        <td className="px-4 py-3 font-semibold">
                          {score ? `${score} / 10` : "-"}
                        </td>

                        <td className="px-4 py-3 font-semibold">
                          {avgCondition ? `${avgCondition} / 10` : "-"}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreStatus.className}`}
                          >
                            {scoreStatus.label}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {getComplaints(sub) || "-"}
                        </td>

                        <td className="px-4 py-3">
                          {getAccountsAssigned(sub) || "-"}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {getStatus(sub)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {id ? (
                            <Link
                              href={`/subcontractors/${safeId}`}
                              className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                            >
                              View / Edit
                            </Link>
                          ) : (
                            <span className="text-xs text-red-600">
                              Missing ID
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}