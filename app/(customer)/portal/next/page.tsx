import { Card, EmptyState, Screen, StatusPill } from "@/app/ui";
import { getNextCleanings } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";
import { portalDay } from "../words";

export const dynamic = "force-dynamic";

export default async function PortalNextCleaningsPage() {
  const { account, lang, words } = await requireCustomer();
  const cleanings = await getNextCleanings(account.accountId, 8);

  return (
    <Screen title={words.nextTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {cleanings.length === 0 ? (
        <EmptyState icon="clock" title={words.noNextCleaning} />
      ) : (
        <ul className="ui-cardlist" aria-label={words.nextTitle}>
          {cleanings.map((c) => (
            <li key={c.date}>
              <Card title={portalDay(c.date, lang)} right={c.moved ? <StatusPill kind="waiting">{words.moved}</StatusPill> : undefined}>
                <p>{words.windows[c.timeWindow] ?? c.timeWindow}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <a href="/portal/date" className="ui-btn ui-btn-second">
        {words.needOtherDay}
      </a>
    </Screen>
  );
}
