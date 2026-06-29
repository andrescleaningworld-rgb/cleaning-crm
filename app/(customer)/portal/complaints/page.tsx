import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { ComplaintsForm } from "./form";

export default async function ComplaintsPage() {
  const session = await getIronSession<PortalSessionData>(await cookies(), sessionOptions());
  if (!session.accountId) redirect("/portal/login");
  return (
    <ComplaintsForm
      accountId={session.accountId!}
      accountName={session.accountName!}
    />
  );
}
