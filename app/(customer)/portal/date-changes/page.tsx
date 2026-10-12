import { redirect } from "next/navigation";

// The older portal's form. It lives at /portal/date now.
export default function PortalOldDatePage() {
  redirect("/portal/date");
}
