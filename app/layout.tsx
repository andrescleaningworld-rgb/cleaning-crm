import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import OneSignalInit from "./components/OneSignalInit";
import CWHeader from "./components/CWHeader";
import VersionCheckBanner from "./components/VersionCheckBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cleaning World",
  description: "Cleaning World Service Portal & Operations",
  manifest: "/manifest.json",
  applicationName: "Cleaning World",
  appleWebApp: {
    capable: true,
    title: "Cleaning World",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/cw-logo.jpg",
    apple: "/cw-logo.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#003b7a",
  width: "device-width",
  initialScale: 1,
};

// Vercel System Environment Variable, injected automatically for
// git-connected deployments — same value for every request served by this
// deployment, so reading it here doesn't reintroduce the per-request
// blocking behavior the layout was recently changed to avoid (it's a sync
// env var read, not a fetch). Falls back to a constant in local dev, where
// it's unset.
const BUILD_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || "dev";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VersionCheckBanner initialVersion={BUILD_VERSION} />
        <ServiceWorkerRegister />
        <OneSignalInit />

        <div className="cw-app-shell">
          <div className="cw-app-container">
            <CWHeader />

            <main className="cw-page-card">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}