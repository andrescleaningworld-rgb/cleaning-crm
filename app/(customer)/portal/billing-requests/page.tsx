import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { BillingRequestForm } from "./form";

export default async function BillingRequestsPage() {
  const session = await getIronSession<PortalSessionData>(await cookies(), sessionOptions());
  if (!session.accountId) redirect("/portal/login");
  return (
    <BillingRequestForm
      accountId={session.accountId!}
      accountName={session.accountName!}
    />
  );
}
