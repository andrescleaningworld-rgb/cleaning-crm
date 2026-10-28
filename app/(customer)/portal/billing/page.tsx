import { Screen } from "@/app/ui";
import { BILLING_EMAIL } from "@/lib/portalContacts";
import { getMonthlyPrice } from "@/lib/pg/portal-home";
import { isTaxExempt } from "@/lib/pg/tax-exempt";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

// "My bill": the customer's own monthly price, big, and how to ask about a
// bill. The price comes from the account's price field and nothing else is
// shown: not what the sub is paid, not revenue, no other number. The billing
// question form is one tap further (/portal/billing-requests). Prices are
// before tax: "$X / month + sales tax", or "$X / month" for a tax-exempt
// account (migration 065).
export default async function PortalBillPage() {
  const { account, words } = await requireCustomer();
  const [price, taxExempt] = await Promise.all([getMonthlyPrice(account.accountId), isTaxExempt(account.accountId)]);

  return (
    <Screen title={words.myBill} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      <section className="ui-portal-price" aria-label={words.monthlyPrice} data-portal-price={price ? "1" : "0"}>
        <span className="ui-portal-price-label">{words.monthlyPrice}</span>
        {price ? (
          <>
            <span className="ui-portal-price-amount">{price}</span>
            <span className="ui-portal-price-note">{taxExempt ? words.perMonthTaxExempt : words.perMonth}</span>
          </>
        ) : (
          <span className="ui-portal-price-note">{words.noPrice}</span>
        )}
      </section>

      <h2 className="ui-portal-heading">{words.billQuestions}</h2>
      <a href={`mailto:${BILLING_EMAIL}`} className="ui-btn ui-btn-main">
        ✉️ {words.emailTo(BILLING_EMAIL)}
      </a>
      <a href="/portal/billing-requests" className="ui-btn ui-btn-second">
        {words.writeBilling}
      </a>
    </Screen>
  );
}
