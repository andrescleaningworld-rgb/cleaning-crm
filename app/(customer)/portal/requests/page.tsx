import { Card, EmptyState, Screen } from "@/app/ui";
import { getMyRequests } from "@/lib/pg/portal-home";
import { LangToggle, PortalStatus } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

// "What I sent": everything this location sent, newest first, with where it
// stands in one colored word. Staff notes are never shown here.
export default async function PortalMyRequestsPage() {
  const { account, words } = await requireCustomer();
  const requests = await getMyRequests(account.accountId);

  return (
    <Screen title={words.requestsTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {requests.length === 0 ? (
        <EmptyState icon="inbox" title={words.noRequests} />
      ) : (
        <ul className="ui-cardlist" aria-label={words.requestsTitle}>
          {requests.map((r) => (
            <li key={r.key}>
              <Card title={words.kinds[r.kind] ?? r.kind} right={<PortalStatus state={r.state} />}>
                {r.summary ? <p>{r.summary}</p> : null}
                <p className="ui-muted">{r.date}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
