import Link from "next/link";
import { getMergedPortalAccounts } from "@/lib/googleSheets";
import PortalTable from "./portal-table";

// No cookies()/headers() call here (auth is enforced by proxy.ts, not read
// in-page), so Next would otherwise statically freeze this page's account
// list at build time -- admins enabling/disabling portal accounts wouldn't
// see it reflected here until the next deploy.
export const dynamic = "force-dynamic";

export default async function PortalAccessPage() {
  const accounts = await getMergedPortalAccounts().catch(() => []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
            ← Settings
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Customer Portal Access</h1>
          <p className="mt-1 text-gray-600">
            All accounts from the main Accounts sheet are listed below. Click <strong>Enable</strong> to add an account to the customer portal, or <strong>Edit</strong> to manage their phone number, scheduled service date, estimated billing, and portal code.
          </p>
        </div>

        <PortalTable initial={accounts} />
      </div>
    </main>
  );
}
