import { Card, Screen } from "@/app/ui";
import { getOfficePhone } from "@/lib/pg/portal-auth";
import { getPortalHomeAccount } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

const OFFICE_EMAIL = "info@cleaningworldinc.com";

// "Call or text us": the office number, the same for every customer (typed
// in Settings → Customer Portal Access), one tap to call and one to text,
// and the name of the account's manager when it has one.
export default async function PortalContactPage() {
  const { account, words } = await requireCustomer();
  const [details, officePhone] = await Promise.all([getPortalHomeAccount(account.accountId), getOfficePhone()]);
  const digits = officePhone.replace(/\D/g, "");
  const dial = digits.length === 10 ? `+1${digits}` : "";

  return (
    <Screen title={words.contactTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {dial ? (
        <Card title={words.officeNumber}>
          <p className="ui-stat-value">{officePhone}</p>
          <div className="ui-two">
            <a href={`tel:${dial}`} className="ui-btn ui-btn-main">
              📞 {words.call}
            </a>
            <a href={`sms:${dial}`} className="ui-btn ui-btn-second">
              💬 {words.text}
            </a>
          </div>
        </Card>
      ) : (
        <p>{words.noPhone}</p>
      )}
      {details?.managerName ? (
        <Card title={words.yourManager}>
          <p className="ui-strong">{details.managerName}</p>
        </Card>
      ) : null}
      <a href={`mailto:${OFFICE_EMAIL}`} className="ui-btn ui-btn-second">
        ✉️ {words.emailOffice}
      </a>
    </Screen>
  );
}
