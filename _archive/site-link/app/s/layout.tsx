import type { Metadata } from "next";

// Every /s/[token] page is a private, tokenized link handed directly to a
// sub's employee — never meant to be indexed or crawled.
export const metadata: Metadata = {
  title: "Site Link",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SiteLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
