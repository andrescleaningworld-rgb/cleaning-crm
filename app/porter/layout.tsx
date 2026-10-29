// Crew Link (the no-login link crews open on their phones): the whole screen
// is the crew page. Same approach as app/equipment-check/layout.tsx: the root
// layout always draws the CRM header and a padded page card, which on a
// 360px phone take about a third of the width; this layer covers them, so
// the rows get the full width and no CRM link is visible to the crew.
export default function CrewLinkLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100">{children}</div>;
}
