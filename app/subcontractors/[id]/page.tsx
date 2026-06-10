"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

  scoreStatus?: string;
  ScoreStatus?: string;
  "Score Status"?: string;

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

function getSubId(sub: Subcontractor) {
  return sub.id || sub.ID || sub.subcontractorId || "";
}

function getCompanyName(sub: Subcontractor) {
  return (
    sub.companyName ||
    sub.CompanyName ||
    sub.company ||
    "Unnamed Subcontractor"
  );
}

function getValue(
  sub: Subcontractor,
  camelKey: keyof Subcontractor,
  capsKey: keyof Subcontractor,
  spacedKey?: keyof Subcontractor
) {
  return String(
    sub[camelKey] || sub[capsKey] || (spacedKey ? sub[spacedKey] : "") || ""
  );
}

function getScoreStatus(scoreValue: string, existingStatus?: string) {
  if (existingStatus) {
    return {
      label: existingStatus,
      className: getScoreStatusClass(existingStatus),
    };
  }

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

function getScoreStatusClass(status: string) {
  const clean = status.toLowerCase();

  if (clean === "excellent") return "bg-green-100 text-green-800";
  if (clean === "good") return "bg-blue-100 text-blue-800";
  if (clean === "needs attention") return "bg-yellow-100 text-yellow-800";
  if (clean === "high risk") return "bg-red-100 text-red-800";

  return "bg-slate-100 text-slate-700";
}

export default function SubcontractorDetailPage() {
  const params = useParams();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const pageId = decodeURIComponent(rawId || "");

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
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
    notes: "",
  });

  async function loadSubcontractors() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/subcontractors", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to load subcontractors.");
      }

      const list = Array.isArray(data) ? data : data.subcontractors || [];
      setSubcontractors(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubcontractors();
  }, []);

  const subcontractor = useMemo(() => {
    return subcontractors.find((sub) => {
      const subId = getSubId(sub);
      return String(subId).trim() === String(pageId).trim();
    });
  }, [subcontractors, pageId]);

  useEffect(() => {
    if (!subcontractor) return;

    setForm({
      companyName:
        subcontractor.companyName ||
        subcontractor.CompanyName ||
        subcontractor.company ||
        "",
      contactName: getValue(subcontractor, "contactName", "ContactName"),
      phone: getValue(subcontractor, "phone", "Phone"),
      email: getValue(subcontractor, "email", "Email"),
      address: getValue(subcontractor, "address", "Address"),
      areasServiced: getValue(subcontractor, "areasServiced", "AreasServiced"),
      servicesProvided: getValue(
        subcontractor,
        "servicesProvided",
        "ServicesProvided"
      ),
      employeeCapacity: getValue(
        subcontractor,
        "employeeCapacity",
        "EmployeeCapacity"
      ),
      insuranceExpiration: getValue(
        subcontractor,
        "insuranceExpiration",
        "InsuranceExpiration"
      ),
      status: subcontractor.status || subcontractor.Status || "Active",
      notes: getValue(subcontractor, "notes", "Notes"),
    });
  }, [subcontractor]);

  function updateForm(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
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
          action: "updateSubcontractor",
          id: pageId,
          companyName: form.companyName,
          contactName: form.contactName,
          phone: form.phone,
          email: form.email,
          address: form.address,
          areasServiced: form.areasServiced,
          servicesProvided: form.servicesProvided,
          employeeCapacity: form.employeeCapacity,
          insuranceExpiration: form.insuranceExpiration,
          status: form.status,
          notes: form.notes,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to update subcontractor.");
      }

      setSuccessMessage("Subcontractor updated successfully.");
      setEditing(false);
      await loadSubcontractors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 px-6 py-8 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Loading subcontractor...</p>
        </div>
      </main>
    );
  }

  if (!subcontractor) {
    return (
      <main className="min-h-screen bg-gray-100 px-6 py-8 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Subcontractor Not Found</h1>

          <p className="mt-2 text-slate-700">
            We could not find a subcontractor matching this ID.
          </p>

          <div className="mt-5">
            <Link
              href="/subcontractors"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Back to Subcontractors
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const score = getValue(subcontractor, "score", "Score");
  const scoreStatusValue = getValue(
    subcontractor,
    "scoreStatus",
    "ScoreStatus",
    "Score Status"
  );
  const complaints = getValue(subcontractor, "complaints", "Complaints");
  const avgCondition = getValue(
    subcontractor,
    "avgCondition",
    "AvgCondition",
    "Avg Condition"
  );
  const accountsAssigned = getValue(
    subcontractor,
    "accountsAssigned",
    "AccountsAssigned",
    "Accounts Assigned"
  );
  const lastReview = getValue(
    subcontractor,
    "lastReview",
    "LastReview",
    "Last Review"
  );

  const scoreStatus = getScoreStatus(score, scoreStatusValue);

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-3">
                <Link
                  href="/subcontractors"
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  ← Back to Subcontractors
                </Link>
              </div>

              <h1 className="text-2xl font-bold">
                {getCompanyName(subcontractor)}
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Subcontractor ID: {pageId}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {form.status || "Active"}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreStatus.className}`}
                >
                  {scoreStatus.label}
                </span>

                <span className="text-sm font-semibold text-slate-700">
                  Automatic Score: {score ? `${score} / 10` : "Not scored"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditing((prev) => !prev)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {editing ? "Cancel Edit" : "Edit Subcontractor"}
            </button>
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

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">Automatic Performance Score</h2>
              <p className="mt-1 text-sm text-slate-600">
                This score is calculated from visits, complaints, and assigned
                accounts.
              </p>
            </div>

            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${scoreStatus.className}`}
            >
              {scoreStatus.label}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
            <Detail label="Score" value={score ? `${score} / 10` : "-"} />
            <Detail label="Performance" value={scoreStatus.label} />
            <Detail label="Open Complaints" value={complaints || "0"} />
            <Detail label="Avg Visit Condition" value={avgCondition || "-"} />
            <Detail label="Accounts Assigned" value={accountsAssigned || "0"} />
            <Detail label="Last Activity" value={lastReview || "-"} />
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Score logic: starts from average visit condition, then subtracts 0.5
            for each open complaint. Status: 9–10 Excellent, 8–8.9 Good,
            7–7.9 Needs Attention, below 7 High Risk.
          </div>
        </section>

        {!editing ? (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Subcontractor Details</h2>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Detail label="Company Name" value={form.companyName} />
              <Detail label="Contact Name" value={form.contactName} />
              <Detail label="Phone" value={form.phone} />
              <Detail label="Email" value={form.email} />
              <Detail label="Address" value={form.address} />
              <Detail label="Areas Serviced" value={form.areasServiced} />
              <Detail label="Services Provided" value={form.servicesProvided} />
              <Detail label="Employee Capacity" value={form.employeeCapacity} />
              <Detail
                label="Insurance Expiration"
                value={form.insuranceExpiration}
              />
              <Detail label="Status" value={form.status} />
              <Detail label="Notes" value={form.notes} full />
            </div>
          </section>
        ) : (
          <form
            onSubmit={handleSave}
            className="rounded-2xl bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-bold">Edit Subcontractor</h2>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Company Name"
                value={form.companyName}
                onChange={(value) => updateForm("companyName", value)}
                required
              />

              <Input
                label="Contact Name"
                value={form.contactName}
                onChange={(value) => updateForm("contactName", value)}
              />

              <Input
                label="Phone"
                value={form.phone}
                onChange={(value) => updateForm("phone", value)}
              />

              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) => updateForm("email", value)}
              />

              <Input
                label="Address"
                value={form.address}
                onChange={(value) => updateForm("address", value)}
                full
              />

              <Input
                label="Areas Serviced"
                value={form.areasServiced}
                onChange={(value) => updateForm("areasServiced", value)}
              />

              <Input
                label="Services Provided"
                value={form.servicesProvided}
                onChange={(value) => updateForm("servicesProvided", value)}
              />

              <Input
                label="Employee Capacity"
                value={form.employeeCapacity}
                onChange={(value) => updateForm("employeeCapacity", value)}
              />

              <Input
                label="Insurance Expiration"
                type="date"
                value={form.insuranceExpiration}
                onChange={(value) => updateForm("insuranceExpiration", value)}
              />

              <div>
                <label className="text-sm font-semibold">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => updateForm("status", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              The performance score is automatic and cannot be edited here. It
              updates from visits, complaints, and accounts assigned to this
              subcontractor.
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Detail({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {value || "-"}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="text-sm font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}