import { getNextCleanings } from "@/lib/pg/portal-home";
import { DateForm } from "../request-forms";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

export default async function PortalChangeDatePage() {
  const { account } = await requireCustomer();
  const upcoming = (await getNextCleanings(account.accountId, 6)).map((c) => ({ date: c.date, timeWindow: c.timeWindow }));
  return <DateForm accountName={account.accountName} upcoming={upcoming} />;
}
