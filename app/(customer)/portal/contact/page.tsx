import { Card, Screen } from "@/app/ui";
import { getPortalHomeAccount } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

const OFFICE_EMAIL = "info@cleaningworldinc.com";

// "Call or text us": the account's manager, one tap to call, one to text.
export default async function PortalContactPage() {
  const { account, words } = await requireCustomer();
  const details = await getPortalHomeAccount(account.accountId);
  const digits = (details?.managerPhone ?? "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : "";

  return (
    <Screen title={words.contactTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {phone ? (
        <Card title={details?.managerName ? `${words.yourManager}: ${details.managerName}` : words.yourManager}>
          <p className="ui-strong">{details?.managerPhone}</p>
          <div className="ui-two">
            <a href={`tel:${phone}`} className="ui-btn ui-btn-main">
              📞 {words.call}
            </a>
            <a href={`sms:${phone}`} className="ui-btn ui-btn-second">
              💬 {words.text}
            </a>
          </div>
        </Card>
      ) : (
        <p>{words.noPhone}</p>
      )}
      <a href={`mailto:${OFFICE_EMAIL}`} className="ui-btn ui-btn-second">
        ✉️ {words.emailOffice}
      </a>
    </Screen>
  );
}
