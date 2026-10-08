import { redirect } from "next/navigation";
import { getPortalLogin } from "@/lib/portalAuth";
import { newPortalOn } from "@/lib/portalSession";
import NewPortalLogin from "./new-login";
import OldPortalLogin from "./old-login";

export const dynamic = "force-dynamic";

// Where the new portal runs: email + password. Everywhere else: the phone +
// code login, exactly as before.
export default async function PortalLoginPage() {
  if (!newPortalOn()) return <OldPortalLogin />;
  const login = await getPortalLogin();
  if (login) redirect(login.current ? "/portal" : "/portal/locations");
  return <NewPortalLogin />;
}
