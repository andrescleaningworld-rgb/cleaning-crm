import { ProblemForm } from "../request-forms";
import { requireCustomer } from "../server";
import { openPortalComplaint } from "@/lib/pg/complaint-changes";

export const dynamic = "force-dynamic";

export default async function PortalProblemPage() {
  const { account } = await requireCustomer();
  // Their newest problem that is still open: shown on top, so they can add to it instead of sending a new one.
  const open = await openPortalComplaint(account.accountId).catch((error) => {
    console.error("[portal/problem] open complaint did not load:", error instanceof Error ? error.message : error);
    return null;
  });
  return <ProblemForm accountName={account.accountName} openProblem={open} />;
}
