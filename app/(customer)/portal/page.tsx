import { Screen, Tips } from "@/app/ui";
import { getMyRequests } from "@/lib/pg/portal-home";
import { LangToggle, PortalBigTile, PortalLogoutButton, PortalStatus } from "./portal-ui";
import { requireCustomer } from "./server";
import { listPortalPhotos } from "@/lib/pg/crew-photos";

export const dynamic = "force-dynamic";

// The customer portal's home: the account's name and four giant buttons, one
// tap each. Under them, the last things this customer sent and where each
// one stands. Everything else is one tap further in (a date change under My
// cleanings, the monthly price under My bill).
export default async function PortalHomePage() {
  const { login, account, words } = await requireCustomer();
  const [requests, photos] = await Promise.all([getMyRequests(account.accountId), listPortalPhotos(account.accountId, 1).catch(() => [])]);
  // Photos: only when the crew has sent some this customer may see (the account's setting is on).
  const showPhotos = photos.length > 0;
  const latest = requests.slice(0, 3);

  return (
    <Screen title={account.accountName} subtitle={account.address || words.brand} headerRight={<LangToggle />}>
      {account.isTest ? (
        <p className="ui-savestatus" role="note">
          {words.testBanner}
        </p>
      ) : null}

      <nav className="ui-portal-tiles" aria-label={words.home}>
        <PortalBigTile href="/portal/problem" icon="⚠️" label={words.reportProblem} tip="problem" />
        <PortalBigTile href="/portal/service" icon="✨" label={words.extraService} tip="extra" />
        <PortalBigTile href="/portal/visits" icon="🧹" label={words.myCleanings} />
        {showPhotos ? <PortalBigTile href="/portal/photos" icon="📷" label={words.photos} /> : null}
        <PortalBigTile href="/portal/contact" icon="📞" label={words.contactUs} tip="contact" />
      </nav>

      {latest.length > 0 ? (
        <section className="ui-stack" aria-label={words.myRequests}>
          <h2 className="ui-portal-heading">{words.myRequests}</h2>
          <ul className="ui-cardlist">
            {latest.map((r) => (
              <li key={r.key} className="ui-portal-sent-row">
                <span className="ui-portal-sent-words">
                  <span className="ui-strong">{words.kinds[r.kind] ?? r.kind}</span>
                  <span className="ui-muted">{r.date}</span>
                </span>
                <PortalStatus state={r.state} />
              </li>
            ))}
          </ul>
          {requests.length > latest.length ? (
            <a href="/portal/requests" className="ui-btn ui-btn-second">
              {words.seeAll}
            </a>
          ) : null}
        </section>
      ) : null}

      <div className="ui-actions-row">
        <a href="/portal/billing" className="ui-btn ui-btn-second">
          💳 {words.myBill}
        </a>
        {login.accounts.length > 1 ? (
          <a href="/portal/locations" className="ui-btn ui-btn-second">
            {words.switchLocation}
          </a>
        ) : null}
        <PortalLogoutButton />
      </div>

      {/* Shown once, the first time this customer opens the portal on this device. */}
      <Tips
        id="portal-home"
        steps={[
          { target: '[data-tip="problem"]', text: words.tipProblem },
          { target: '[data-tip="extra"]', text: words.tipExtra },
          { target: '[data-tip="contact"]', text: words.tipContact },
        ]}
      />
    </Screen>
  );
}
