import { BillingForm } from "../request-forms";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

export default async function PortalBillingPage() {
  const { account } = await requireCustomer();
  return <BillingForm accountName={account.accountName} />;
}
