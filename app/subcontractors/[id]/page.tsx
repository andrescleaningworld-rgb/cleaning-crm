"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";

type AnyRow = Record<string, any>;

type Subcontractor = {
  id?: string;
  ID?: string;
  subcontractorId?: string;
  "Subcontractor ID"?: string;

  companyName?: string;
  CompanyName?: string;
  "Company Name"?: string;
  company?: string;
  Company?: string;

  contactName?: string;
  ContactName?: string;
  "Contact Name"?: string;

  phone?: string;
  Phone?: string;

  email?: string;
  Email?: string;

  address?: string;
  Address?: string;

  areasServiced?: string;
  AreasServiced?: string;
  "Areas Serviced"?: string;

  servicesProvided?: string;
  ServicesProvided?: string;
  "Services Provided"?: string;

  employeeCapacity?: string;
  EmployeeCapacity?: string;
  "Employee Capacity"?: string;

  insuranceExpiration?: string;
  InsuranceExpiration?: string;
  "Insurance Expiration"?: string;

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

function getAnyValue(row: AnyRow, possibleKeys: string[]) {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return "";
}

function getSubId(sub: Subcontractor) {
  return getAnyValue(sub, [
    "id",
    "ID",
    "subcontractorId",
    "Subcontractor ID",
  ]);
}

function getCompanyName(sub: Subcontractor) {
  return (
    getAnyValue(sub, [
      "companyName",
      "CompanyName",
      "Company Name",
      "company",
      "Company",
      "name",
      "Name",
    ]) || "Unnamed Subcontractor"
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

function money(value: any) {
  const number = Number(String(value || 0).replace(/[$,]/g, "") || 0);

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function numberValue(value: any) {
  return Number(String(value || 0).replace(/[$,% ,]/g, "") || 0);
}

function safeDate(value: any) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString();
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

function getStatusClass(statusValue: string) {
  const status = statusValue.toLowerCase();

  if (status.includes("active")) return "bg-green-100 text-green-800";
  if (status.includes("cancel")) return "bg-red-100 text-red-800";
  if (status.includes("paused")) return "bg-yellow-100 text-yellow-800";
  if (status.includes("inactive")) return "bg-slate-100 text-slate-700";

  return "bg-slate-100 text-slate-700";
}

function getInsuranceStatus(expirationValue: string) {
  if (!expirationValue) {
    return {
      label: "No Date",
      className: "bg-slate-100 text-slate-700",
    };
  }

  const expiration = new Date(expirationValue);

  if (Number.isNaN(expiration.getTime())) {
    return {
      label: "Check Date",
      className: "bg-yellow-100 text-yellow-800",
    };
  }

  const today = new Date();
  const soon = new Date();
  soon.setDate(today.getDate() + 30);

  if (expiration < today) {
    return {
      label: "Expired",
      className: "bg-red-100 text-red-800",
    };
  }

  if (expiration <= soon) {
    return {
      label: "Expiring Soon",
      className: "bg-yellow-100 text-yellow-800",
    };
  }

  return {
    label: "Current",
    className: "bg-green-100 text-green-800",
  };
}

function getAccountId(account: AnyRow) {
  return getAnyValue(account, ["id", "ID", "accountId", "Account ID"]);
}

function getAccountName(account: AnyRow) {
  return (
    getAnyValue(account, [
      "accountName",
      "Account Name",
      "account",
      "Account",
      "customer",
      "Customer",
      "name",
      "Name",
    ]) || "-"
  );
}

function getAccountManager(account: AnyRow) {
  return getAnyValue(account, [
    "manager",
    "Manager",
    "accountManager",
    "Account Manager",
  ]);
}

function getAccountSubcontractor(account: AnyRow) {
  return getAnyValue(account, [
    "subcontractor",
    "Subcontractor",
    "subContractor",
    "Sub Contractor",
    "cleaner",
    "Cleaner",
    "assignedSubcontractor",
    "Assigned Subcontractor",
  ]);
}

function getAccountStatus(account: AnyRow) {
  return getAnyValue(account, [
    "status",
    "Status",
    "accountStatus",
    "Account Status",
  ]);
}

function getFrequency(account: AnyRow) {
  return getAnyValue(account, ["frequency", "Frequency"]);
}

function getCleaningDays(account: AnyRow) {
  return getAnyValue(account, ["cleaningDays", "Cleaning Days"]);
}

function getStartDate(account: AnyRow) {
  return getAnyValue(account, [
    "startDate",
    "Start Date",
    "serviceStartDate",
    "Service Start Date",
    "dateStarted",
    "Date Started",
  ]);
}

function getCancelledDate(account: AnyRow) {
  return getAnyValue(account, [
    "cancelledDate",
    "Cancelled Date",
    "canceledDate",
    "Canceled Date",
    "dateCancelled",
    "Date Cancelled",
    "cancellationDate",
    "Cancellation Date",
  ]);
}

function getMonthlyRevenue(account: AnyRow) {
  return numberValue(
    getAnyValue(account, [
      "monthlyRevenue",
      "Monthly Revenue",
      "whatCleaningWorldGetsPaid",
      "What Cleaning World Gets Paid",
      "cleaningWorldGetsPaid",
      "Cleaning World Gets Paid",
      "monthlyAmount",
      "Monthly Amount",
      "price",
      "Price",
    ])
  );
}

function getMonthlySubPay(account: AnyRow) {
  return numberValue(
    getAnyValue(account, [
      "monthlySubcontractorPay",
      "Monthly Subcontractor Pay",
      "subcontractorPay",
      "Subcontractor Pay",
      "subPay",
      "Sub Pay",
      "cleanerPay",
      "Cleaner Pay",
    ])
  );
}

function getGrossMargin(account: AnyRow) {
  return getMonthlyRevenue(account) - getMonthlySubPay(account);
}

function getGrossMarginPercent(account: AnyRow) {
  const revenue = getMonthlyRevenue(account);

  if (!revenue) return 0;

  return (getGrossMargin(account) / revenue) * 100;
}

function getAccountHealth(account: AnyRow) {
  return getAnyValue(account, [
    "accountHealth",
    "Account Health",
    "health",
    "Health",
  ]);
}

function getAccountNotes(account: AnyRow) {
  return getAnyValue(account, [
    "notes",
    "Notes",
    "cancelReason",
    "Cancel Reason",
    "cancellationReason",
    "Cancellation Reason",
    "reason",
    "Reason",
  ]);
}

function getComplaintAccountName(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "account",
    "Account",
    "accountName",
    "Account Name",
  ]);
}

function getComplaintStatus(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "status",
    "Status",
    "complaintStatus",
    "Complaint Status",
  ]);
}

function getComplaintDate(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "date",
    "Date",
    "complaintDate",
    "Complaint Date",
  ]);
}

function getComplaintIssue(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "issue",
    "Issue",
    "complaint",
    "Complaint",
    "description",
    "Description",
  ]);
}

function getComplaintValidity(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "validity",
    "Validity",
    "complaintValidity",
    "Complaint Validity",
  ]);
}

function normalize(value: any) {
  return String(value || "").trim().toLowerCase();
}

export default function SubcontractorDetailPage() {
  const params = useParams();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const pageId = decodeURIComponent(rawId || "");

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [accounts, setAccounts] = useState<AnyRow[]>([]);
  const [complaintsData, setComplaintsData] = useState<AnyRow[]>([]);

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

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [subcontractorsRes, accountsRes, complaintsRes] =
        await Promise.allSettled([
          fetch("/api/subcontractors", { cache: "no-store" }),
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/complaints", { cache: "no-store" }),
        ]);

      async function readResult(result: PromiseSettledResult<Response>) {
        if (result.status !== "fulfilled") return [];

        const data = await result.value.json();

        if (Array.isArray(data)) return data;
        if (Array.isArray(data.subcontractors)) return data.subcontractors;
        if (Array.isArray(data.accounts)) return data.accounts;
        if (Array.isArray(data.complaints)) return data.complaints;

        return [];
      }

      setSubcontractors(await readResult(subcontractorsRes));
      setAccounts(await readResult(accountsRes));
      setComplaintsData(await readResult(complaintsRes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
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
        getAnyValue(subcontractor, [
          "companyName",
          "CompanyName",
          "Company Name",
          "company",
          "Company",
        ]) || "",
      contactName: getValue(
        subcontractor,
        "contactName",
        "ContactName",
        "Contact Name"
      ),
      phone: getValue(subcontractor, "phone", "Phone"),
      email: getValue(subcontractor, "email", "Email"),
      address: getValue(subcontractor, "address", "Address"),
      areasServiced: getValue(
        subcontractor,
        "areasServiced",
        "AreasServiced",
        "Areas Serviced"
      ),
      servicesProvided: getValue(
        subcontractor,
        "servicesProvided",
        "ServicesProvided",
        "Services Provided"
      ),
      employeeCapacity: getValue(
        subcontractor,
        "employeeCapacity",
        "EmployeeCapacity",
        "Employee Capacity"
      ),
      insuranceExpiration: getValue(
        subcontractor,
        "insuranceExpiration",
        "InsuranceExpiration",
        "Insurance Expiration"
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

  async function handleSave(e: FormEvent<HTMLFormElement>) {
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
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const score = subcontractor ? getValue(subcontractor, "score", "Score") : "";
  const scoreStatusValue = subcontractor
    ? getValue(subcontractor, "scoreStatus", "ScoreStatus", "Score Status")
    : "";
  const avgCondition = subcontractor
    ? getValue(subcontractor, "avgCondition", "AvgCondition", "Avg Condition")
    : "";
  const lastReview = subcontractor
    ? getValue(subcontractor, "lastReview", "LastReview", "Last Review")
    : "";

  const scoreStatus = getScoreStatus(score, scoreStatusValue);
  const insuranceStatus = getInsuranceStatus(form.insuranceExpiration);

  const subcontractorAccounts = useMemo(() => {
    if (!subcontractor) return [];

    const subId = normalize(getSubId(subcontractor));
    const companyName = normalize(getCompanyName(subcontractor));
    const contactName = normalize(
      getValue(subcontractor, "contactName", "ContactName", "Contact Name")
    );

    return accounts.filter((account) => {
      const assignedSub = normalize(getAccountSubcontractor(account));

      if (!assignedSub) return false;

      return (
        assignedSub === subId ||
        assignedSub === companyName ||
        assignedSub === contactName ||
        assignedSub.includes(companyName) ||
        companyName.includes(assignedSub) ||
        assignedSub.includes(contactName)
      );
    });
  }, [accounts, subcontractor]);

  const currentAccounts = useMemo(() => {
    return subcontractorAccounts.filter((account) => {
      const status = normalize(getAccountStatus(account));
      return !status.includes("cancel");
    });
  }, [subcontractorAccounts]);

  const pastAccounts = useMemo(() => {
    return subcontractorAccounts.filter((account) => {
      const status = normalize(getAccountStatus(account));
      return status.includes("cancel");
    });
  }, [subcontractorAccounts]);

  const relatedComplaints = useMemo(() => {
    const accountNames = new Set(
      subcontractorAccounts.map((account) => normalize(getAccountName(account)))
    );

    return complaintsData.filter((complaint) => {
      const complaintAccount = normalize(getComplaintAccountName(complaint));
      return accountNames.has(complaintAccount);
    });
  }, [complaintsData, subcontractorAccounts]);

  const openComplaints = relatedComplaints.filter((complaint) => {
    const status = normalize(getComplaintStatus(complaint));

    return (
      status.includes("open") ||
      status.includes("pending") ||
      status.includes("needs") ||
      status === ""
    );
  });

  const validComplaints = relatedComplaints.filter((complaint) => {
    const validity = normalize(getComplaintValidity(complaint));
    return validity.includes("valid") && !validity.includes("not");
  });

  const totals = useMemo(() => {
    const activeRevenue = currentAccounts.reduce(
      (sum, account) => sum + getMonthlyRevenue(account),
      0
    );

    const activeSubPay = currentAccounts.reduce(
      (sum, account) => sum + getMonthlySubPay(account),
      0
    );

    const lostRevenue = pastAccounts.reduce(
      (sum, account) => sum + getMonthlyRevenue(account),
      0
    );

    const lostSubPay = pastAccounts.reduce(
      (sum, account) => sum + getMonthlySubPay(account),
      0
    );

    const grossMargin = activeRevenue - activeSubPay;
    const grossMarginPercent = activeRevenue
      ? (grossMargin / activeRevenue) * 100
      : 0;

    return {
      activeRevenue,
      activeSubPay,
      grossMargin,
      grossMarginPercent,
      lostRevenue,
      lostSubPay,
      lostMargin: lostRevenue - lostSubPay,
    };
  }, [currentAccounts, pastAccounts]);

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

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
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
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                    form.status || "Active"
                  )}`}
                >
                  {form.status || "Active"}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreStatus.className}`}
                >
                  {scoreStatus.label}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${insuranceStatus.className}`}
                >
                  Insurance: {insuranceStatus.label}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={loadData}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>

              <button
                type="button"
                onClick={() => setEditing((prev) => !prev)}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                {editing ? "Cancel Edit" : "Edit Subcontractor"}
              </button>
            </div>
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

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard label="Active Accounts" value={String(currentAccounts.length)} />
          <StatCard label="Past Accounts" value={String(pastAccounts.length)} />
          <StatCard
            label="Monthly Revenue"
            value={money(totals.activeRevenue)}
          />
          <StatCard label="Monthly Sub Pay" value={money(totals.activeSubPay)} />
          <StatCard label="Gross Margin" value={money(totals.grossMargin)} />
          <StatCard
            label="Gross Margin %"
            value={`${totals.grossMarginPercent.toFixed(1)}%`}
          />
          <StatCard label="Open Complaints" value={String(openComplaints.length)} />
          <StatCard label="Valid Complaints" value={String(validComplaints.length)} />
        </section>

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
            <Detail label="Open Complaints" value={String(openComplaints.length)} />
            <Detail label="Avg Visit Condition" value={avgCondition || "-"} />
            <Detail
              label="Accounts Assigned"
              value={String(currentAccounts.length)}
            />
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
                value={safeDate(form.insuranceExpiration)}
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

        <AccountsTable
          title="Current Accounts"
          description="Accounts currently assigned to this subcontractor."
          accounts={currentAccounts}
          emptyText="No current accounts found."
          showCancelledDate={false}
        />

        <AccountsTable
          title="Past / Cancelled Accounts"
          description="Accounts this subcontractor had before."
          accounts={pastAccounts}
          emptyText="No past accounts found."
          showCancelledDate
        />

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold">Recent Complaints</h2>
            <p className="mt-1 text-sm text-slate-600">
              Complaints connected to this subcontractor’s current and past
              accounts.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-700">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Validity</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody>
                {relatedComplaints.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No complaints found for this subcontractor.
                    </td>
                  </tr>
                ) : (
                  relatedComplaints.slice(0, 25).map((complaint, index) => (
                    <tr key={index} className="border-b">
                      <td className="px-4 py-3">
                        {safeDate(getComplaintDate(complaint))}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {getComplaintAccountName(complaint) || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {getComplaintIssue(complaint) || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {getComplaintValidity(complaint) || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {getComplaintStatus(complaint) || "Pending"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function AccountsTable({
  title,
  description,
  accounts,
  emptyText,
  showCancelledDate,
}: {
  title: string;
  description: string;
  accounts: AnyRow[];
  emptyText: string;
  showCancelledDate: boolean;
}) {
  const revenueTotal = accounts.reduce(
    (sum, account) => sum + getMonthlyRevenue(account),
    0
  );

  const subPayTotal = accounts.reduce(
    (sum, account) => sum + getMonthlySubPay(account),
    0
  );

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-slate-600">{description}</p>
        </div>

        <div className="text-sm font-semibold text-slate-700">
          Revenue: {money(revenueTotal)} | Sub Pay: {money(subPayTotal)} |
          Margin: {money(revenueTotal - subPayTotal)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-700">
              {showCancelledDate && <th className="px-4 py-3">Cancelled</th>}
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Sub Pay</th>
              <th className="px-4 py-3">Margin</th>
              <th className="px-4 py-3">GM %</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Status</th>
              {showCancelledDate && <th className="px-4 py-3">Notes</th>}
            </tr>
          </thead>

          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td
                  colSpan={showCancelledDate ? 11 : 9}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              accounts.map((account, index) => {
                const accountId = getAccountId(account);

                return (
                  <tr key={accountId || index} className="border-b">
                    {showCancelledDate && (
                      <td className="px-4 py-3">
                        {safeDate(getCancelledDate(account))}
                      </td>
                    )}

                    <td className="px-4 py-3 font-semibold">
                      {accountId ? (
                        <Link
                          href={`/accounts/${encodeURIComponent(accountId)}`}
                          className="text-blue-700 hover:underline"
                        >
                          {getAccountName(account)}
                        </Link>
                      ) : (
                        getAccountName(account)
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {getAccountManager(account) || "-"}
                    </td>

                    <td className="px-4 py-3">
                      {[getFrequency(account), getCleaningDays(account)]
                        .filter(Boolean)
                        .join(" / ") || "-"}
                    </td>

                    <td className="px-4 py-3">
                      {money(getMonthlyRevenue(account))}
                    </td>

                    <td className="px-4 py-3">
                      {money(getMonthlySubPay(account))}
                    </td>

                    <td className="px-4 py-3">
                      {money(getGrossMargin(account))}
                    </td>

                    <td className="px-4 py-3">
                      {getGrossMarginPercent(account).toFixed(1)}%
                    </td>

                    <td className="px-4 py-3">
                      {getAccountHealth(account) || "-"}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          getAccountStatus(account)
                        )}`}
                      >
                        {getAccountStatus(account) || "Active"}
                      </span>
                    </td>

                    {showCancelledDate && (
                      <td className="px-4 py-3">
                        {getAccountNotes(account) || "-"}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
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