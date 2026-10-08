import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { newPortalOn, sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { ServiceRequestForm } from "./form";

export default async function ServiceRequestsPage() {
  // Where the new portal runs, this form lives at /portal/service.
  if (newPortalOn()) redirect("/portal/service");
  const session = await getIronSession<PortalSessionData>(await cookies(), sessionOptions());
  if (!session.accountId) redirect("/portal/login");
  return (
    <ServiceRequestForm
      accountId={session.accountId!}
      accountName={session.accountName!}
    />
  );
}
