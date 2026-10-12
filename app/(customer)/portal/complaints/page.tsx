import { redirect } from "next/navigation";

// The older portal's form. It lives at /portal/problem now.
export default function PortalOldComplaintsPage() {
  redirect("/portal/problem");
}
