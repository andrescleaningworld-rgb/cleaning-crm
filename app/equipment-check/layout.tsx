import type { Metadata, Viewport } from "next";

// Equipment Check tablet app (docs/equipment-check-spec.md). A private,
// secret-keyed link — never indexed. The manifest link is injected by the
// page (it needs the key for start_url), same as app/team-hub/layout.tsx.
export const metadata: Metadata = {
  title: "Equipment Check",
  robots: { index: false, follow: false, nocache: true },
  applicationName: "Equipment Check",
  appleWebApp: { capable: true, title: "Equipment", statusBarStyle: "default" },
  icons: { apple: "/team-hub-icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
  userScalable: false,
};

// "No nav, no access to any other CRM page": the root layout always renders
// the CRM header (CWHeader), which shows the nav whenever this browser has a
// remembered admin role. Rather than change that shared header, this app
// draws itself as a full-screen layer on top of it, so no CRM link is ever
// visible or tappable from the tablet.
export default function EquipmentCheckLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100">{children}</div>;
}
