import { BillingForm } from "../request-forms";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

// The billing question form, one tap in from "My bill" (/portal/billing).
export default async function PortalBillingQuestionPage() {
  const { account } = await requireCustomer();
  return <BillingForm accountName={account.accountName} />;
}
