import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import Image from "next/image";
import Link from "next/link";
import { sessionOptions, SESSION_COOKIE, type PortalSessionData } from "@/lib/portalSession";
import { getMainAccountByName, getCustomerByPortalCode, getVisitsByAccountName } from "@/lib/googleSheets";
import PortalVisitCalendar from "./portal-visit-calendar";

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

// ─── sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status.trim().toLowerCase() === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-green-500" : "bg-red-500"}`} />
      {status || "Unknown"}
    </span>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function PortalDashboardPage() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  console.log("[dashboard] cookies received →", allCookies.map(c => c.name));

  const session = await getIronSession<PortalSessionData>(cookieStore, sessionOptions());
  console.log("[dashboard] session →", {
    accountId:   session.accountId,
    accountName: session.accountName,
    portalCode:  session.portalCode,
  });

  if (!session.accountId || !session.portalCode || !session.accountName) {
    console.log("[dashboard] REDIRECT — session missing fields");
    redirect("/portal/login");
  }

  // Fetch main account data, portal billing data, and scheduled visits in parallel
  const [account, portalData, visits] = await Promise.all([
    getMainAccountByName(session.accountName).catch(() => null),
    getCustomerByPortalCode(session.portalCode).catch(() => null),
    getVisitsByAccountName(session.accountName).catch(() => []),
  ]);

  console.log("[dashboard] account lookup →", account
    ? { name: account.accountName, status: account.status }
    : "NOT FOUND in main sheet");
  console.log("[dashboard] portalData →", portalData
    ? { nextScheduled: portalData.nextScheduledService, estimated: portalData.estimatedMonthlyTotal }
    : "NOT FOUND in portal tab");

  async function logout() {
    "use server";
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/portal/login");
  }

  return (
    <main
      className="min-h-screen px-4 py-8"
      style={{ background: "linear-gradient(160deg, #003b7a 0%, #005bbb 50%, #eef7ff 100%)" }}
    >
      <div className="mx-auto w-full max-w-lg space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow">
              <Image
                src="/logo-CW-single-phone-optimized.png"
                alt="Cleaning World"
                width={32}
                height={32}
                className="rounded-lg object-contain"
                priority
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">
                Cleaning World
              </p>
              <h1 className="text-base font-bold leading-tight text-white">
                Welcome, {account?.accountName ?? session.accountName}
              </h1>
            </div>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
            >
              Log Out
            </button>
          </form>
        </div>

        {/* ── Status ── */}
        <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm">
          <span className="text-sm font-semibold text-slate-700">Account Status</span>
          <StatusBadge status={account?.status ?? ""} />
        </div>

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

        {/* ── Scope of Work ── */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Scope of Work
          </p>
          <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
            {val(account?.scopeOfWork)}
          </p>
        </div>

        {/* ── Address ── */}
        <Section title="Service Address">
          <Row label="Address" value={val(account?.address)} />
        </Section>

        {/* ── Billing ── */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Billing
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {formatCurrency(portalData?.estimatedMonthlyTotal ?? "")}
            </span>
            <span className="text-sm text-slate-500">/ month</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Estimated monthly total. Includes 6.625% NJ Sales Tax. Amount assumes no service
            changes or missed cleanings.
          </p>
        </div>

        {/* ── Quick Actions ── */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Quick Actions
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: "/portal/complaints", label: "Report an Issue", icon: "⚠️" },
              { href: "/portal/service-requests", label: "Request Service", icon: "✨" },
              { href: "/portal/date-changes", label: "Change Date", icon: "📅" },
              { href: "/portal/billing-requests", label: "Billing Request", icon: "💳" },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-700 transition hover:border-[#003b7a] hover:bg-blue-50 hover:text-[#003b7a] active:scale-95"
              >
                <span className="text-2xl">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Footer logout ── */}
        <form action={logout} className="pt-2 pb-4">
          <button
            type="submit"
            className="min-h-[48px] w-full rounded-xl border border-white/20 bg-white/10 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
          >
            Log Out of Customer Portal
          </button>
        </form>

      </div>
    </main>
  );
}
