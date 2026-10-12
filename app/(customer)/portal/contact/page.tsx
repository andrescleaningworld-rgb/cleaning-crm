import { Screen } from "@/app/ui";
import { BILLING_EMAIL, SERVICE_EMAIL } from "@/lib/portalContacts";
import { getOfficePhone } from "@/lib/pg/portal-auth";
import { getPortalHomeAccount } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

/** "+12015550100" for tel: and sms: links, or "" when the text is not a 10-digit number. */
function dialOf(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return digits.length === 10 ? `+1${digits}` : "";
}

// "Contact us": who to reach, with giant Call, Text and Email buttons. It is
// the account's own manager (name, phone, email) when it has one; with no
// manager on the account it is the office (the number typed in Settings →
// Customer Portal Access). A manager with no phone on file: the office
// number is used for Call and Text. Under the buttons, the two email
// addresses with what each one is for: billing and service.
export default async function PortalContactPage() {
  const { account, words } = await requireCustomer();
  const [details, officePhone] = await Promise.all([getPortalHomeAccount(account.accountId), getOfficePhone()]);
  const managerName = details?.managerName ?? "";
  const managerPhone = managerName ? (details?.managerPhone ?? "") : "";
  const managerEmail = managerName ? (details?.managerEmail ?? "") : "";
  // Who the big buttons reach.
  const phone = dialOf(managerPhone) ? managerPhone : officePhone;
  const dial = dialOf(phone);
  const email = managerEmail || SERVICE_EMAIL;
  const who = managerName ? `${words.yourManager}: ${managerName}` : words.office;

  return (
    <Screen title={words.contactTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      <p className="ui-portal-who" data-portal-contact={managerName ? "manager" : "office"}>
        {who}
        {dial ? (
          <>
            <br />
            <span className="ui-muted">{phone}</span>
          </>
        ) : null}
      </p>
      {dial ? null : <p>{words.noPhone}</p>}
      <nav className="ui-portal-tiles" aria-label={who}>
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
        <a href={`mailto:${email}`} className="ui-portal-tile">
          <span className="ui-portal-tile-icon" aria-hidden="true">
            ✉️
          </span>
          <span className="ui-portal-tile-label">{words.emailOffice}</span>
        </a>
      </nav>

      <h2 className="ui-portal-heading">{words.emailUs}</h2>
      <ul className="ui-portal-emails">
        <li>
          <a href={`mailto:${BILLING_EMAIL}`}>
            <strong>{words.billingEmail}</strong>
            {BILLING_EMAIL}
          </a>
        </li>
        <li>
          <a href={`mailto:${SERVICE_EMAIL}`}>
            <strong>{words.serviceEmail}</strong>
            {SERVICE_EMAIL}
          </a>
        </li>
      </ul>

      <a href="/portal/billing" className="ui-btn ui-btn-second">
        💳 {words.myBill}
      </a>
    </Screen>
  );
}
