import { redirect } from "next/navigation";

// The older portal's form. It lives at /portal/billing now.
export default function PortalOldBillingPage() {
  redirect("/portal/billing");
}
