import type { Metadata, Viewport } from "next";
import TeamHubServiceWorkerRegister from "./TeamHubServiceWorkerRegister";

// Every /team-hub/[token] page is a private, tokenized link handed directly
// to a crew — never meant to be indexed or crawled. Mirrors app/s/layout.tsx
// (now _archive/site-link/app/s/layout.tsx) before it was superseded.
//
// No top-level `manifest` field here: the manifest's start_url has to be
// this worker's own crew token (see app/team-hub/manifest.webmanifest/route.ts),
// which this layout doesn't know — app/team-hub/[token]/page.tsx injects the
// <link rel="manifest"> itself once it has the token. icons/appleWebApp
// don't vary by token, so those are static here same as the main app's root
// layout (app/layout.tsx) — untouched by this file.
export const metadata: Metadata = {
  title: "Team Hub",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  applicationName: "Team Hub",
  appleWebApp: {
    capable: true,
    title: "Team Hub",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/team-hub-icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
  userScalable: false,
};

export default function TeamHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TeamHubServiceWorkerRegister />
      {children}
    </>
  );
}
