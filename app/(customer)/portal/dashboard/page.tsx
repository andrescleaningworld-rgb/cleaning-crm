import { redirect } from "next/navigation";

// The older portal's home. One portal now: its home is /portal.
export default function PortalDashboardPage() {
  redirect("/portal");
}
