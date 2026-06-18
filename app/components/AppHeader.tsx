import Image from "next/image";
import Link from "next/link";

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
};

export default function AppHeader({
  title = "Cleaning World",
  subtitle = "Operations & Quality Management System",
}: AppHeaderProps) {
  return (
    <header
      style={{
        width: "100%",
        borderRadius: "24px",
        padding: "22px",
        marginBottom: "26px",
        background:
          "linear-gradient(135deg, #003b7a 0%, #005bbb 45%, #00a8e8 100%)",
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
            gap: "16px",
            textDecoration: "none",
            color: "white",
          }}
        >
          <div
            style={{
              width: "82px",
              height: "82px",
              borderRadius: "20px",
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Image
              src="/cw-logo.jpg"
              alt="Cleaning World Logo"
              width={82}
              height={82}
              priority
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
                fontSize: "30px",
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              {title}
            </h1>

            <p
              style={{
                margin: "6px 0 0",
                fontSize: "14px",
                fontWeight: 500,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              {subtitle}
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
          <HeaderLink href="/" label="Dashboard" />
          <HeaderLink href="/to-do" label="To-Do List" />
          <HeaderLink href="/accounts" label="Accounts" />
          <HeaderLink href="/visits" label="Visits" />
          <HeaderLink href="/complaints" label="Complaints" />
          <HeaderLink href="/account-updates" label="Updates" />
          <HeaderLink href="/subcontractors" label="Subs" />
          <HeaderLink href="/sales" label="Sales" />
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({ href, label }: { href: string; label: string }) {
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