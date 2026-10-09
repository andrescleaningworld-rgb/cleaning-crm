import { Card, EmptyState, Screen, StatusPill, type StatusKind } from "@/app/ui";
import { getMyRequests, type PortalRequestState } from "@/lib/pg/portal-home";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

const PILL: Record<PortalRequestState, StatusKind> = { received: "waiting", working: "waiting", done: "done" };

// "My requests": everything this location sent, newest first, with where it
// stands in plain words. Staff notes are never shown here.
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
              <Card title={words.kinds[r.kind] ?? r.kind} right={<StatusPill kind={PILL[r.state]}>{words.states[r.state]}</StatusPill>}>
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
