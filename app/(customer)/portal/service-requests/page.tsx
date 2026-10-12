import { redirect } from "next/navigation";

// The older portal's form. It lives at /portal/service now.
export default function PortalOldServicePage() {
  redirect("/portal/service");
}
