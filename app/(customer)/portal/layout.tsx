import type { ReactNode } from "react";
import { PortalLangProvider } from "./portal-ui";
import { portalLang } from "./server";

// Every customer portal screen gets its words in the language the customer
// picked (English unless they tapped Español).
export default async function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalLangProvider lang={await portalLang()}>{children}</PortalLangProvider>;
}
