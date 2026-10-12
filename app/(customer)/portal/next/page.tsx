import { redirect } from "next/navigation";

// Next cleanings are the top of My cleanings now.
export default function PortalNextCleaningsPage() {
  redirect("/portal/visits");
}
