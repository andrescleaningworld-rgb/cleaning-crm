import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import CWHeader from "./components/CWHeader";
import { getPortalNewCount } from "@/lib/googleSheets";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const portalCount = await getPortalNewCount().catch(() => 0);

  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />

        <div className="cw-app-shell">
          <div className="cw-app-container">
            <CWHeader portalCount={portalCount} />

            <main className="cw-page-card">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}