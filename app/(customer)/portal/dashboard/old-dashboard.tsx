import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { BigButton, Screen, StatusPill } from "@/app/ui";
import { sessionOptions, SESSION_COOKIE, type PortalSessionData } from "@/lib/portalSession";
import { getCustomerByPortalCode } from "@/lib/data/customer-portal";
import { getVisitsByAccountName } from "@/lib/data/visits";
import { getMainAccountByName } from "@/lib/data/accounts";
import PortalVisitCalendar from "./portal-visit-calendar";
import ServiceScheduleSection from "./service-schedule-section";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatCurrency(raw: string): string {
  if (!raw) return "—";
  const num = parseFloat(raw.replace(/[$,\s]/g, ""));
  if (isNaN(num)) return raw;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function val(s: string | undefined) {
  return s?.trim() || "—";
}

// What the customer just sent (the forms come back here with ?submitted=…).
const SENT: Record<string, string> = {
  complaint: "Your report was sent. Cleaning World will follow up with you.",
  "service-request": "Your service request was sent. Cleaning World will follow up with you.",
  "date-change": "Your date change request was sent. Cleaning World will follow up with you.",
  "billing-request": "Your billing request was sent. Cleaning World will follow up with you.",
};

// ─── sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ui-card ui-stack">
      <h2 className="ui-card-title">{title}</h2>
      <dl className="ui-details">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status.trim().toLowerCase() === "active";
  return <StatusPill kind={active ? "done" : "needs-you"}>{status || "Unknown"}</StatusPill>;
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function OldPortalDashboard({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const sent = SENT[(await searchParams).submitted ?? ""] ?? "";
  const cookieStore = await cookies();

  const session = await getIronSession<PortalSessionData>(cookieStore, sessionOptions());

  if (!session.accountId || !session.portalCode || !session.accountName) {
    redirect("/portal/login");
  }

  // Fetch main account data, portal billing data, and scheduled visits in parallel
  const [account, portalData, visits] = await Promise.all([
    getMainAccountByName(session.accountName).catch(() => null),
    getCustomerByPortalCode(session.portalCode).catch(() => null),
    getVisitsByAccountName(session.accountName).catch(() => []),
  ]);

  async function logout() {
    "use server";
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/portal/login");
  }

  return (
    <Screen
      title={`Welcome, ${account?.accountName ?? session.accountName}`}
      subtitle="Cleaning World"
      headerRight={
        <form action={logout}>
          <button type="submit" className="ui-btn ui-btn-second">
            Log Out
          </button>
        </form>
      }
    >
      {sent ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {sent}
        </p>
      ) : null}

      {/* ── Status ── */}
      <section className="ui-card ui-stack">
        <div className="ui-card-row">
          <h2 className="ui-card-title">Account Status</h2>
          <StatusBadge status={account?.status ?? ""} />
        </div>
      </section>

      {/* ── Quick Actions ── */}
      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">Quick Actions</h2>
        <div className="ui-two">
          {[
            { href: "/portal/complaints", label: "Report an Issue" },
            { href: "/portal/service-requests", label: "Request Service" },
            { href: "/portal/date-changes", label: "Change Date" },
            { href: "/portal/billing-requests", label: "Billing Request" },
          ].map(({ href, label }) => (
            <BigButton key={href} kind="second" href={href}>
              {label}
            </BigButton>
          ))}
        </div>
      </section>

      {/* ── Service Details ── */}
      <Section title="Service Details">
        <Row label="Service Type"  value={val(account?.serviceType)} />
        <Row label="Frequency"     value={val(account?.frequency)} />
        <Row label="Cleaning Days" value={val(account?.cleaningDays)} />
        <Row label="Start Date"    value={val(account?.startDate)} />
      </Section>

      {/* ── Schedule ── */}
      <Section title="Schedule">
        <Row label="Next Scheduled Service" value={val(portalData?.nextScheduledService)} />
        <Row label="Last Visit Date"        value={val(account?.lastVisitDate)} />
      </Section>

      {/* ── Visit Calendar ── */}
      <PortalVisitCalendar visits={visits} />

      {/* ── Service Schedule ── */}
      <ServiceScheduleSection />

      {/* ── Scope of Work ── */}
      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">Scope of Work</h2>
        <p className="whitespace-pre-line">{val(account?.scopeOfWork)}</p>
      </section>

      {/* ── Address ── */}
      <Section title="Service Address">
        <Row label="Address" value={val(account?.address)} />
      </Section>

      {/* ── Billing ── */}
      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">Billing</h2>
        <p>
          <span className="ui-stat-value">{formatCurrency(portalData?.estimatedMonthlyTotal ?? "")}</span>{" "}
          <span className="ui-muted">/ month</span>
        </p>
        <p className="ui-muted">
          Estimated monthly total. Includes 6.625% NJ Sales Tax. Amount assumes no service
          changes or missed cleanings.
        </p>
      </section>

      {/* ── Footer logout ── */}
      <form action={logout}>
        <button type="submit" className="ui-btn ui-btn-second w-full">
          Log Out of Customer Portal
        </button>
      </form>
    </Screen>
  );
}
