import { listPortalSubmissions } from "@/lib/googleSheets";
import SubmissionsView from "./submissions-view";

// No cookies()/headers() call here (auth is enforced by proxy.ts, not read
// in-page), so Next would otherwise statically freeze the submissions list
// at build time -- new portal requests and status changes wouldn't show up
// here until the next deploy.
export const dynamic = "force-dynamic";

export default async function PortalRequestsPage() {
  const submissions = await listPortalSubmissions().catch(() => []);
  const newCount = submissions.filter((s) => s.status === "New").length;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">

        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Portal Requests</h1>
            {newCount > 0 && (
              <span className="rounded-full bg-yellow-400 px-3 py-1 text-sm font-bold text-yellow-900">
                {newCount} New
              </span>
            )}
          </div>
          <p className="mt-1 text-gray-600">
            Customer submissions from the portal — complaints, service requests, date changes, and billing inquiries.
          </p>
        </div>

        <SubmissionsView initial={submissions} />
      </div>
    </main>
  );
}
