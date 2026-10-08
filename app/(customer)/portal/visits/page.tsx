import { Card, EmptyState, Screen } from "@/app/ui";
import { getPastVisits } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";
import { portalDay } from "../words";

export const dynamic = "force-dynamic";

export default async function PortalPastVisitsPage() {
  const { account, lang, words } = await requireCustomer();
  const visits = await getPastVisits(account.accountId, account.accountName);

  return (
    <Screen title={words.visitsTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {visits.length === 0 ? (
        <EmptyState icon="inbox" title={words.noVisits} />
      ) : (
        <ul className="ui-cardlist" aria-label={words.visitsTitle}>
          {visits.map((v, i) => (
            <li key={`${v.date}-${v.kind}-${i}`}>
              <Card title={portalDay(v.date, lang)}>
                <p>{v.kind === "cleaning" ? words.cleaningVisit : v.kind === "scheduled" ? words.scheduledVisit : words.checkVisit}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
