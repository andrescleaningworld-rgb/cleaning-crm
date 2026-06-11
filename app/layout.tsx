import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cleaning World App",
  description: "Cleaning World Operations & Quality Management System",
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/visits", label: "Visits" },
  { href: "/complaints", label: "Complaints" },
  { href: "/account-updates", label: "Updates" },
  { href: "/subcontractors", label: "Subs" },
  { href: "/sales", label: "Sales" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
  { href: "/map", label: "Map" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="cw-app-shell">
          <div className="cw-app-container">
            <header className="cw-header">
              <div className="cw-header-inner">
                <Link href="/" className="cw-brand">
                  <div className="cw-logo-box">
                    <img
                      src="/cw-logo.jpg"
                      alt="Cleaning World Logo"
                      className="cw-logo"
                    />
                  </div>

                  <div className="cw-brand-text">
                    <h1>Cleaning World</h1>
                    <p>Operations & Quality Management System</p>
                  </div>
                </Link>

                <nav className="cw-nav" aria-label="Main navigation">
                  {navItems.map((item) => (
                    <NavButton
                      key={item.href}
                      href={item.href}
                      label={item.label}
                    />
                  ))}
                </nav>
              </div>
            </header>

            <main className="cw-page-card">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

function NavButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="cw-nav-button">
      {label}
    </Link>
  );
}