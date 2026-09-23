// Served at /equipment-check/manifest.webmanifest — the Equipment Check
// tablet app's own home-screen manifest, scoped to /equipment-check/ so the
// installed app can never open another CRM page. Same shape as
// app/team-hub/manifest.webmanifest/route.ts: start_url has to carry the
// secret link key, which the page passes in as ?key=.
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const startUrl = key ? `/equipment-check/${encodeURIComponent(key)}` : "/equipment-check";

  return NextResponse.json(
    {
      name: "Equipment Check",
      short_name: "Equipment",
      description: "Report how you left the equipment — Cleaning World.",
      start_url: startUrl,
      scope: "/equipment-check/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#1d4ed8",
      icons: [
        { src: "/team-hub-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/team-hub-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/team-hub-icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
