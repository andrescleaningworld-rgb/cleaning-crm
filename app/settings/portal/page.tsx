import { Screen } from "@/app/ui";
import { getMergedPortalAccounts } from "@/lib/data/customer-portal";
import PortalTable from "./portal-table";

// No cookies()/headers() call here (auth is enforced by proxy.ts, not read
// in-page), so Next would otherwise statically freeze this page's account
// list at build time -- admins enabling/disabling portal accounts wouldn't
// see it reflected here until the next deploy.
export const dynamic = "force-dynamic";

export default async function PortalAccessPage() {
  const accounts = await getMergedPortalAccounts().catch(() => []);

  return (
    <Screen
      title="Customer Portal Access"
      subtitle="Every account is listed. Enable adds an account to the customer portal. Edit changes its phone number, next service, estimated billing and portal code."
      backHref="/settings"
    >
      <PortalTable initial={accounts} />
    </Screen>
  );
}
