// Served at /team-hub/manifest.webmanifest — deliberately NOT app/manifest.ts
// (which is root-only per Next.js's metadata file convention and would
// touch the main app's manifest). A plain route handler gives full control
// over both the exact scoped URL and content-type, and keeps this
// completely separate from app/manifest.ts / public/manifest.json (the main
// app's manifests — untouched).
import { NextRequest, NextResponse } from "next/server";

// start_url has to be THIS worker's own crew link, not a bare "/team-hub/"
// (which 404s — only /team-hub/[token] is a real page). Every crew's page
// links here with ?token=<token> (see app/team-hub/[token]/page.tsx's
// dynamic <link rel="manifest">), so the installed icon always reopens the
// same crew's link. scope stays the broader "/team-hub/" — narrower than
// that would be unusual, not invalid; a worker only ever installs from one
// token's page anyway.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const startUrl = token ? `/team-hub/${encodeURIComponent(token)}` : "/team-hub";

  return NextResponse.json(
    {
      name: "Team Hub",
      short_name: "Team Hub",
      description: "Crew checklist, rounds, and handoff — Cleaning World Team Hub.",
      start_url: startUrl,
      scope: "/team-hub/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#1d4ed8",
      orientation: "portrait",
      icons: [
        {
          src: "/team-hub-icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/team-hub-icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/team-hub-icons/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
