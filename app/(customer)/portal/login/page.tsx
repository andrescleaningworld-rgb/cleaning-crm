import { redirect } from "next/navigation";
import { getPortalLogin } from "@/lib/portalAuth";
import NewPortalLogin from "./new-login";

export const dynamic = "force-dynamic";

// The one customer login: email + password. The older phone + code login
// and the phone-only /customer-portal pages are gone; their addresses land here.
export default async function PortalLoginPage() {
  const login = await getPortalLogin();
  if (login) redirect(login.current ? "/portal" : "/portal/locations");
  return <NewPortalLogin />;
}
