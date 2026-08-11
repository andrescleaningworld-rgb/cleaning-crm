import { redirect } from "next/navigation";

// Activity Log moved into Sub Center as a tab (it's subcontractor-specific
// data, not top-level) — this route stays only so any existing bookmark or
// hardcoded link keeps working instead of 404ing. The actual UI/logic now
// lives in app/sub-center/activity-log.tsx.
export default function ActivityLogRedirect() {
  redirect("/sub-center?tab=activity");
}
