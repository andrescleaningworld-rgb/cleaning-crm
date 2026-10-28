import type { ReactNode } from "react";
import { PortalLangProvider } from "./portal-ui";
import PreviewBanner from "./preview-banner";
import { portalLang } from "./server";
import { previewLogin } from "@/lib/portalPreview";

// Every customer portal screen gets its words in the language the customer
// picked (English unless they tapped Español). During a staff "View as
// customer" (lib/portalPreview.ts) every screen also gets the orange preview
// bar on top, and every Send / Save button is off.
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const lang = await portalLang();
  const preview = await previewLogin().catch(() => null);
  return (
    <PortalLangProvider lang={lang} preview={preview ? { accountId: preview.account.accountId, accountName: preview.account.accountName, shared: preview.shared } : null}>
      {preview ? <PreviewBanner accountId={preview.account.accountId} accountName={preview.account.accountName} lang={lang} shared={preview.shared} /> : null}
      {children}
    </PortalLangProvider>
  );
}
