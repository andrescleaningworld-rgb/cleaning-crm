import type { Metadata } from "next";

// The crew screens inside the preview frame. Like the Pin Board TV, it draws
// itself as a full-screen layer over the office header, so the admin sees
// only what a crew sees.
export const metadata: Metadata = {
  title: "Crew Link preview",
  robots: { index: false, follow: false, nocache: true },
};

export default function CrewLinkPreviewScreenLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100">{children}</div>;
}
