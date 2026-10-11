import type { Metadata } from "next";

// Office TV mode. A secret link, never indexed, and it sends no referrer, so
// the link does not leak to another site. Like the Equipment Check tablet
// app, it draws itself as a full-screen layer over the CRM header, so
// nothing else in the app is visible or tappable from the TV.
export const metadata: Metadata = {
  title: "Pin Board TV",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function BoardTvLayout({ children }: { children: React.ReactNode }) {
  // Written out (top/left/right/bottom) instead of "inset": an older TV browser does not know "inset",
  // and without it this layer is not fixed at all and the page scrolls.
  return <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, overflow: "hidden", background: "#0c447c" }}>{children}</div>;
}
