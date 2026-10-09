import { listPortalSubmissions } from "@/lib/data/customer-portal";
import { Screen, StatusPill } from "@/app/ui";
import SubmissionsView from "./submissions-view";

// No cookies()/headers() call here (auth is enforced by proxy.ts, not read
// in-page), so Next would otherwise statically freeze the submissions list
// at build time -- new portal requests and status changes wouldn't show up
// here until the next deploy.
export const dynamic = "force-dynamic";

export default async function PortalRequestsPage() {
  const submissions = await listPortalSubmissions().catch(() => []);
  const newCount = submissions.filter((s) => s.status === "New").length;

  return (
    <Screen
      title="Portal Requests"
      subtitle="What customers sent from the portal: complaints, service requests, date changes and billing questions."
      headerRight={newCount > 0 ? <StatusPill kind="needs-you">{newCount} New</StatusPill> : undefined}
    >
      <SubmissionsView initial={submissions} />
    </Screen>
  );
}
