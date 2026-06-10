import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cleaning World App",
  description: "Cleaning World Operations & Quality Management System",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background:
            "linear-gradient(180deg, #eef7ff 0%, #f8fbff 45%, #ffffff 100%)",
          color: "#0f172a",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: "1400px",
              margin: "0 auto",
            }}
          >
            <header
              style={{
                width: "100%",
                borderRadius: "26px",
                padding: "22px",
                marginBottom: "24px",
                background:
                  "linear-gradient(135deg, #003b7a 0%, #005bbb 48%, #00a8e8 100%)",
                color: "white",
                boxShadow: "0 14px 34px rgba(0, 59, 122, 0.25)",
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href="/"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "18px",
                    textDecoration: "none",
                    color: "white",
                  }}
                >
                  <div
                    style={{
                      width: "150px",
                      height: "82px",
                      borderRadius: "20px",
                      background: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src="/cw-logo.jpg"
                      alt="Cleaning World Logo"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </div>

                  <div>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: "32px",
                        fontWeight: 900,
                        letterSpacing: "-0.04em",
                      }}
                    >
                      Cleaning World
                    </h1>

                    <p
                      style={{
                        margin: "7px 0 0",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.92)",
                      }}
                    >
                      Operations & Quality Management System
                    </p>
                  </div>
                </Link>

                <nav
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <NavButton href="/" label="Dashboard" />
                  <NavButton href="/accounts" label="Accounts" />
                  <NavButton href="/visits" label="Visits" />
                  <NavButton href="/complaints" label="Complaints" />
                  <NavButton href="/account-updates" label="Updates" />
                  <NavButton href="/subcontractors" label="Subs" />
                  <NavButton href="/sales" label="Sales" />
                  <NavButton href="/reports" label="Reports" />
                  <NavButton href="/settings" label="Settings" />
                  <NavButton href="/map" label="Map" />
                </nav>
              </div>
            </header>

            <main
              style={{
                background: "rgba(255,255,255,0.72)",
                borderRadius: "24px",
                padding: "22px",
                border: "1px solid #dbeafe",
                boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
              }}
            >
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}

function NavButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        color: "white",
        textDecoration: "none",
        fontSize: "14px",
        fontWeight: 800,
        padding: "10px 15px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.17)",
        border: "1px solid rgba(255,255,255,0.25)",
      }}
    >
      {label}
    </Link>
  );
}