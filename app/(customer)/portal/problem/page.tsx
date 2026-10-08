import { ProblemForm } from "../request-forms";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

export default async function PortalProblemPage() {
  const { account } = await requireCustomer();
  return <ProblemForm accountName={account.accountName} />;
}
