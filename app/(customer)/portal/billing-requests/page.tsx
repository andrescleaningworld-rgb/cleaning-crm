import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { newPortalOn, sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { BillingRequestForm } from "./form";

export default async function BillingRequestsPage() {
  // Where the new portal runs, this form lives at /portal/billing.
  if (newPortalOn()) redirect("/portal/billing");
  const session = await getIronSession<PortalSessionData>(await cookies(), sessionOptions());
  if (!session.accountId) redirect("/portal/login");
  return (
    <BillingRequestForm
      accountId={session.accountId!}
      accountName={session.accountName!}
    />
  );
}
