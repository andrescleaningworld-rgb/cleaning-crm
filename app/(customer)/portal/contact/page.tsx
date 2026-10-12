import { Screen } from "@/app/ui";
import { getOfficePhone } from "@/lib/pg/portal-auth";
import { getPortalHomeAccount } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

const OFFICE_EMAIL = "info@cleaningworldinc.com";

// "Contact us": three giant buttons, Call, Text and Email. The office number
// is the same for every customer (typed in Settings → Customer Portal
// Access). Under them, the name of the account's manager when it has one,
// and the billing question form.
export default async function PortalContactPage() {
  const { account, words } = await requireCustomer();
  const [details, officePhone] = await Promise.all([getPortalHomeAccount(account.accountId), getOfficePhone()]);
  const digits = officePhone.replace(/\D/g, "");
  const dial = digits.length === 10 ? `+1${digits}` : "";

  return (
    <Screen title={words.contactTitle} subtitle={dial ? officePhone : account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {dial ? null : <p>{words.noPhone}</p>}
      <nav className="ui-portal-tiles" aria-label={words.contactTitle}>
        {dial ? (
          <>
            <a href={`tel:${dial}`} className="ui-portal-tile">
              <span className="ui-portal-tile-icon" aria-hidden="true">
                📞
              </span>
              <span className="ui-portal-tile-label">{words.call}</span>
            </a>
            <a href={`sms:${dial}`} className="ui-portal-tile">
              <span className="ui-portal-tile-icon" aria-hidden="true">
                💬
              </span>
              <span className="ui-portal-tile-label">{words.text}</span>
            </a>
          </>
        ) : null}
        <a href={`mailto:${OFFICE_EMAIL}`} className="ui-portal-tile">
          <span className="ui-portal-tile-icon" aria-hidden="true">
            ✉️
          </span>
          <span className="ui-portal-tile-label">{words.emailOffice}</span>
        </a>
      </nav>
      {details?.managerName ? (
        <p>
          {words.yourManager}: <span className="ui-strong">{details.managerName}</span>
        </p>
      ) : null}
      <a href="/portal/billing" className="ui-btn ui-btn-second">
        💳 {words.billingQuestion}
      </a>
    </Screen>
  );
}
