import { Screen } from "@/app/ui";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

// The screen after every request: one big "Sent ✓".
export default async function PortalSentPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { words } = await requireCustomer();
  const kind = (await searchParams).kind ?? "";

  return (
    <Screen title={words.kinds[kind] ?? words.brand} headerRight={<LangToggle />}>
      <div className="ui-sent" role="status">
        <p className="ui-sent-title">{words.sentTitle}</p>
        <p className="ui-sent-text">{words.sentText}</p>
      </div>
      <a href="/portal/requests" className="ui-btn ui-btn-main">
        {words.seeRequests}
      </a>
      <a href="/portal" className="ui-btn ui-btn-second">
        {words.backHome}
      </a>
    </Screen>
  );
}
