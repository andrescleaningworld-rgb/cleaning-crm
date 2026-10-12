import { redirect } from "next/navigation";
import { EmptyState } from "@/app/ui";
import { newPortalOn } from "@/lib/portalSession";

export const dynamic = "force-dynamic";

// The old customer portal is closed: its API handed out data with no login
// (see app/api/customer-portal/route.ts) and no customer ever used it. Every
// page under /customer-portal shows this one message instead; the old pages
// are still in the folder but are never shown. Where the new portal runs,
// the customer is sent to /portal, as before.
export default function OldCustomerPortalLayout() {
  if (newPortalOn()) redirect("/portal");
  return <EmptyState icon="clock" title="Portal coming soon" text="The customer portal is not open yet. Please call the office and we will help you." />;
}
