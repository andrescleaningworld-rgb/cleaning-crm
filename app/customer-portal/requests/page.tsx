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
      <div className="ui-screen">
        <div className="ui-portal-mark">
          ✅
        </div>
        <h1 className="ui-screen-title">Request Received</h1>
        <p className="ui-muted">
          Your request has been sent to the Cleaning World team. We&apos;ll
          contact you within 1 business day.
        </p>
        <Link
          href="/customer-portal"
          className="ui-btn ui-btn-second"
        >
          Back to My Account
        </Link>
      </div>
    );
  }

  return (
    <div className="ui-screen">
      <Link
        href="/customer-portal"
        className="ui-link"
      >
        ← Back to My Account
      </Link>

      <h1 className="ui-screen-title">
        Submit a Request
      </h1>
      <p className="ui-muted">
        Need a specialty service, a schedule change, or something else? Let us
        know and the team will get back to you within 1 business day.
      </p>

      {pendingRequests.length > 0 && (
        <div className="ui-stat">
          <p className="ui-strong">
            You have {pendingRequests.length} pending{" "}
            {pendingRequests.length === 1 ? "request" : "requests"}:
          </p>
          <ul className="ui-stack">
            {pendingRequests.map((r, i) => (
              <li key={i}>
                · {r.type || "Request"} —{" "}
                <span className="ui-strong">{r.status || "Pending"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="ui-card ui-stack"
      >
        <div>
          <label className="ui-label">
            Request Type
          </label>
          <select
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="ui-input w-full"
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
            <label className="ui-label">
              Select Service(s) *
            </label>
            <p className="ui-muted">
              Choose one or more specialty services you&apos;d like a quote for.
            </p>

            {servicesLoading ? (
              <p className="ui-muted">Loading services...</p>
            ) : servicesError ? (
              <p className="ui-field-error">{servicesError}</p>
            ) : services.length === 0 ? (
              <p className="ui-muted">
                No specialty services are listed right now — describe what you need below.
              </p>
            ) : (
              <div className="ui-two">
                {services.map((service) => {
                  const selected = selectedServiceIds.has(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service.id)}
                      aria-pressed={selected}
                      className={`ui-pick ${selected ? "ui-pick-on" : ""}`.trim()}
                    >
                      {service.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local asset
                        <img
                          src={service.imageUrl}
                          alt=""
                          className="ui-pick-img"
                        />
                      ) : (
                        <div className="ui-pick-img ui-pick-img-empty">
                          🧹
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="ui-strong">{service.name}</p>
                        {service.description ? (
                          <p className="ui-muted">
                            {service.description}
                          </p>
                        ) : null}
                      </div>

                      <span
                        aria-hidden
                        className="ui-pick-mark"
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
          <label className="ui-label">
            {isSpecialty ? "Additional Details (optional)" : "Details *"}
          </label>
          <textarea
            required={!isSpecialty}
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            className="ui-input w-full"
            placeholder={
              isSpecialty
                ? "Anything else we should know? (optional)"
                : "Please describe what you need..."
            }
          />
        </div>

        <div>
          <label className="ui-label">
            Preferred Date (if applicable)
          </label>
          <input
            type="date"
            value={form.preferredDate}
            onChange={(e) =>
              setForm({ ...form, preferredDate: e.target.value })
            }
            className="ui-input w-full"
          />
        </div>

        {error && (
          <div className="ui-field-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="ui-btn ui-btn-main w-full"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
