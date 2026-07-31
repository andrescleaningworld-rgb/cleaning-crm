"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitCustomerRequest, getCustomerRequests } from "../../lib/backend";

const REQUEST_TYPES = [
  "Specialty Service (e.g. floor care, deep clean)",
  "Change Service Date",
  "Change Service Frequency",
  "Temporary Pause / Resume Service",
  "Other Request",
];

// Only "Specialty Service" shows the service picker below — every other
// request type keeps the plain free-text Details field.
const SPECIALTY_TYPE = REQUEST_TYPES[0];

type ExtraServiceOption = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
};

export default function CustomerRequestsPage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [form, setForm] = useState({
    type: REQUEST_TYPES[0],
    details: "",
    preferredDate: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingRequests, setPendingRequests] = useState<
    { type?: string; details?: string; status?: string }[]
  >([]);

  const [services, setServices] = useState<ExtraServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());

  const isSpecialty = form.type === SPECIALTY_TYPE;

  useEffect(() => {
    const storedId = localStorage.getItem("cwCustomerId");
    if (!storedId) {
      router.replace("/customer-portal/login");
      return;
    }
    setCustomerId(storedId);

    async function loadPending() {
      try {
        const reqs = await getCustomerRequests(storedId!);
        setPendingRequests(
          (reqs as { type?: string; issue?: string; details?: string; status?: string }[])
            .filter(
              (r) =>
                !r.type?.toLowerCase().includes("complaint") &&
                !r.issue &&
                (r.status || "Pending") !== "Completed"
            )
            .slice(0, 3)
        );
      } catch {
        // Non-critical — skip
      }
    }
    loadPending();
  }, [router]);

  // Loaded once regardless of the initially-selected type (Specialty Service
  // is REQUEST_TYPES[0], the default, so it's usually needed immediately
  // anyway) — simpler than a conditional fetch keyed to type changes, and
  // the list is small.
  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      setServicesLoading(true);
      setServicesError("");
      try {
        const res = await fetch("/api/customer-portal/extra-services", { cache: "no-store" });
        const data = (await res.json()) as { success?: boolean; services?: ExtraServiceOption[] };
        if (!data.success || !Array.isArray(data.services)) {
          if (!cancelled) setServicesError("Could not load the list of services right now.");
          return;
        }
        if (!cancelled) setServices(data.services);
      } catch {
        if (!cancelled) setServicesError("Could not load the list of services right now.");
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    }

    loadServices();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleService(id: string) {
    setSelectedServiceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleTypeChange(nextType: string) {
    setForm((current) => ({ ...current, type: nextType }));
    if (nextType !== SPECIALTY_TYPE) setSelectedServiceIds(new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return;

    if (isSpecialty && selectedServiceIds.size === 0) {
      setError("Please select at least one service.");
      return;
    }

    // The Apps Script backend this posts to only has a plain-text `details`
    // column for requests — no structured service-picker field — so the
    // selected names are folded into `details` itself rather than sent as a
    // separate field the backend would silently drop.
    const selectedNames = services
      .filter((service) => selectedServiceIds.has(service.id))
      .map((service) => service.name);
    const composedDetails = isSpecialty
      ? [`Requested service(s): ${selectedNames.join(", ")}`, form.details.trim()]
          .filter(Boolean)
          .join("\n\n")
      : form.details;

    try {
      setSubmitting(true);
      setError("");
      await submitCustomerRequest({
        type: form.type,
        details: composedDetails,
        preferredDate: form.preferredDate,
        customerId,
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong submitting your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!customerId) return null;

  if (submitted) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl">
          ✅
        </div>
        <h1 className="text-2xl font-black text-slate-950">Request Received</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your request has been sent to the Cleaning World team. We&apos;ll
          contact you within 1 business day.
        </p>
        <Link
          href="/customer-portal"
          className="mt-6 inline-block rounded-xl bg-purple-700 px-6 py-3 text-sm font-bold text-white hover:bg-purple-800"
        >
          Back to My Account
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-2 py-4 sm:py-6">
      <Link
        href="/customer-portal"
        className="text-sm font-semibold text-purple-700 hover:underline"
      >
        ← Back to My Account
      </Link>

      <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
        Submit a Request
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Need a specialty service, a schedule change, or something else? Let us
        know and the team will get back to you within 1 business day.
      </p>

      {pendingRequests.length > 0 && (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">
            You have {pendingRequests.length} pending{" "}
            {pendingRequests.length === 1 ? "request" : "requests"}:
          </p>
          <ul className="mt-2 space-y-1">
            {pendingRequests.map((r, i) => (
              <li key={i} className="text-xs text-blue-800">
                · {r.type || "Request"} —{" "}
                <span className="font-semibold">{r.status || "Pending"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="block text-sm font-black text-slate-700">
            Request Type
          </label>
          <select
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500"
          >
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {isSpecialty ? (
          <div>
            <label className="block text-sm font-black text-slate-700">
              Select Service(s) *
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Choose one or more specialty services you&apos;d like a quote for.
            </p>

            {servicesLoading ? (
              <p className="mt-3 text-sm text-slate-500">Loading services...</p>
            ) : servicesError ? (
              <p className="mt-3 text-sm font-semibold text-red-700">{servicesError}</p>
            ) : services.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No specialty services are listed right now — describe what you need below.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {services.map((service) => {
                  const selected = selectedServiceIds.has(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service.id)}
                      aria-pressed={selected}
                      className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                        selected
                          ? "border-purple-500 bg-purple-50 ring-2 ring-purple-200"
                          : "border-slate-200 bg-white hover:border-purple-300"
                      }`}
                    >
                      {service.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local asset
                        <img
                          src={service.imageUrl}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-xl border border-slate-100 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                          🧹
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900">{service.name}</p>
                        {service.description ? (
                          <p className="mt-0.5 text-xs leading-5 text-slate-500">
                            {service.description}
                          </p>
                        ) : null}
                      </div>

                      <span
                        aria-hidden
                        className={`ml-auto mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                          selected
                            ? "border-purple-600 bg-purple-600 text-white"
                            : "border-slate-300 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-black text-slate-700">
            {isSpecialty ? "Additional Details (optional)" : "Details *"}
          </label>
          <textarea
            required={!isSpecialty}
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            placeholder={
              isSpecialty
                ? "Anything else we should know? (optional)"
                : "Please describe what you need..."
            }
          />
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700">
            Preferred Date (if applicable)
          </label>
          <input
            type="date"
            value={form.preferredDate}
            onChange={(e) =>
              setForm({ ...form, preferredDate: e.target.value })
            }
            className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-500"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[48px] w-full rounded-xl bg-purple-700 py-3 text-sm font-bold text-white hover:bg-purple-800 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
