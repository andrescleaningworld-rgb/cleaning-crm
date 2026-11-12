import { Card, EmptyState, Screen } from "@/app/ui";
import { getMyRequests } from "@/lib/pg/portal-home";
import { signFileLinks } from "@/lib/files";
import { ComplaintFix, ComplaintTracker, LangToggle, PortalStatus } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

// "What I sent": everything this location sent, newest first, with where it
// stands in one colored word. Staff notes are never shown here. A problem
// shows its complaint number and its tracker: Received → Seen by your
// manager → Team on it → Fixed, and once fixed, how (note, date, after
// photos; tap one to see it bigger).
export default async function PortalMyRequestsPage() {
  const { account, words } = await requireCustomer();
  // Private files: short-lived links this customer may open (lib/files.ts).
  const requests = signFileLinks(await getMyRequests(account.accountId));

  return (
    <Screen title={words.requestsTitle} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {requests.length === 0 ? (
        <EmptyState icon="inbox" title={words.noRequests} />
      ) : (
        <ul className="ui-cardlist" aria-label={words.requestsTitle}>
          {requests.map((r) => (
            <li key={r.key}>
              <Card title={words.kinds[r.kind] ?? r.kind} right={<PortalStatus state={r.state} problem={Boolean(r.complaintNumber)} track={r.track} />}>
                {r.summary ? <p>{r.summary}</p> : null}
                {r.track ? <ComplaintTracker track={r.track} /> : null}
                {r.fix ? <ComplaintFix fix={r.fix} /> : null}
                <p className="ui-muted">
                  {r.date}
                  {r.complaintNumber ? ` · ${words.complaintNumber(r.complaintNumber)}` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
