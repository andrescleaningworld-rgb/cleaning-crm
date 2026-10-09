import { Screen } from "@/app/ui";
import { getMyRequests, getNextCleanings } from "@/lib/pg/portal-home";
import { LangToggle, PortalLogoutButton, PortalTile } from "./portal-ui";
import { requireCustomer } from "./server";
import { portalDay } from "./words";

export const dynamic = "force-dynamic";

// The customer portal's home: seven big buttons, one tap each.
export default async function PortalHomePage() {
  const { login, account, lang, words } = await requireCustomer();
  const [next, requests] = await Promise.all([getNextCleanings(account.accountId, 1), getMyRequests(account.accountId)]);
  const open = requests.filter((r) => r.state !== "done").length;
  const cleaning = next[0];

  return (
    <Screen title={`${words.hello}, ${account.accountName}`} subtitle={account.address || words.brand} headerRight={<LangToggle />}>
      {account.isTest ? (
        <p className="ui-savestatus" role="note">
          {words.testBanner}
        </p>
      ) : null}

      <nav className="ui-tiles" aria-label={words.home}>
        <PortalTile
          href="/portal/next"
          icon="📅"
          label={words.nextCleaning}
          detail={cleaning ? `${portalDay(cleaning.date, lang)} · ${words.windows[cleaning.timeWindow] ?? cleaning.timeWindow}` : words.noNextCleaning}
        />
        <PortalTile href="/portal/visits" icon="🧹" label={words.pastVisits} />
        <PortalTile href="/portal/problem" icon="⚠️" label={words.reportProblem} />
        <PortalTile href="/portal/service" icon="✨" label={words.extraService} />
        <PortalTile href="/portal/date" icon="🔁" label={words.changeDate} />
        <PortalTile href="/portal/billing" icon="💳" label={words.billingQuestion} />
        <PortalTile href="/portal/contact" icon="📞" label={words.contactUs} />
        <PortalTile href="/portal/requests" icon="📋" label={words.myRequests} detail={open > 0 ? `${open} · ${words.states.working}` : undefined} />
      </nav>

      <div className="ui-actions-row">
        {login.accounts.length > 1 ? (
          <a href="/portal/locations" className="ui-btn ui-btn-second">
            {words.switchLocation}
          </a>
        ) : null}
        <PortalLogoutButton />
      </div>
    </Screen>
  );
}
