import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { newPortalOn, sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { DateChangeForm } from "./form";

export default async function DateChangesPage() {
  // Where the new portal runs, this form lives at /portal/date.
  if (newPortalOn()) redirect("/portal/date");
  const session = await getIronSession<PortalSessionData>(await cookies(), sessionOptions());
  if (!session.accountId) redirect("/portal/login");
  return (
    <DateChangeForm
      accountId={session.accountId!}
      accountName={session.accountName!}
    />
  );
}
