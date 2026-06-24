import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import CWHeader from "./components/CWHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cleaning World App",
  description: "Cleaning World Operations & Quality Management System",
  manifest: "/manifest.json",
  applicationName: "Cleaning World Operations",
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />

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