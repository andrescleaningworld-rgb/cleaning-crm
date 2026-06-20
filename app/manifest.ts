import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cleaning World Operations & Quality App",
    short_name: "Cleaning World",
    description:
      "Cleaning World operations app for accounts, visits, complaints, updates, subcontractors, supplies, sales, and reports.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1d4ed8",
    orientation: "portrait",
    icons: [
      {
        src: "/logo-CW-single.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo-CW-single.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo-CW-single.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}