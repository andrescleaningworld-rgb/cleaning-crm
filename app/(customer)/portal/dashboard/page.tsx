import { redirect } from "next/navigation";
import { newPortalOn } from "@/lib/portalSession";
import OldPortalDashboard from "./old-dashboard";

export const dynamic = "force-dynamic";

// Where the new portal runs, its home screen is /portal. Everywhere else
// this is the dashboard of the phone + code portal, exactly as before.
export default async function PortalDashboardPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  if (newPortalOn()) redirect("/portal");
  return <OldPortalDashboard searchParams={searchParams} />;
}
