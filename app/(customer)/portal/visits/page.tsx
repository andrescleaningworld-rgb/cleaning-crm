import { Card, EmptyState, Screen } from "@/app/ui";
import { getNextCleanings, getPastVisits } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";
import { portalDay } from "../words";

export const dynamic = "force-dynamic";

// "My cleanings": the next cleaning on top, then the recent ones, newest
// first. Days only: no crew names, no scores, no notes.
export default async function PortalMyCleaningsPage() {
  const { account, lang, words } = await requireCustomer();
  const [next, visits] = await Promise.all([getNextCleanings(account.accountId, 1), getPastVisits(account.accountId, account.accountName, 12)]);
  const cleaning = next[0];

  return (
    <Screen title={words.visitsTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      <div className="ui-portal-next">
        <p className="ui-portal-next-label">📅 {words.nextCleaning}</p>
        {cleaning ? (
          <>
            <p className="ui-portal-next-day">{portalDay(cleaning.date, lang)}</p>
            {cleaning.timeWindow ? <p className="ui-portal-next-window">{words.windows[cleaning.timeWindow] ?? cleaning.timeWindow}</p> : null}
          </>
        ) : (
          <p className="ui-portal-next-window">{words.noNextCleaning}</p>
        )}
      </div>
      <a href="/portal/date" className="ui-btn ui-btn-second">
        🔁 {words.needOtherDay}
      </a>

      <h2 className="ui-portal-heading">{words.recentCleanings}</h2>
      {visits.length === 0 ? (
        <EmptyState icon="inbox" title={words.noVisits} />
      ) : (
        <ul className="ui-cardlist" aria-label={words.recentCleanings}>
          {visits.map((v, i) => (
            <li key={`${v.date}-${v.kind}-${i}`}>
              <Card title={portalDay(v.date, lang)}>
                <p>{v.kind === "cleaning" ? `✓ ${words.cleaningVisit}` : v.kind === "scheduled" ? words.scheduledVisit : words.checkVisit}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
