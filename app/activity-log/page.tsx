import { redirect } from "next/navigation";

// The sub portal's activity (logins, pages viewed, issues reported) lives in
// Settings -> Activity Log -> Subs now (owner only), next to everything else
// subs did. This old address stays so a bookmark or old link still lands
// there instead of a 404.
export default function ActivityLogRedirect() {
  redirect("/settings/activity-log?tab=subs");
}
