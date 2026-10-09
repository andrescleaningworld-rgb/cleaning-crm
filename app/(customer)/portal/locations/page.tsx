import { redirect } from "next/navigation";
import { Screen } from "@/app/ui";
import { getPortalLogin } from "@/lib/portalAuth";
import { newPortalOn } from "@/lib/portalSession";
import { LangToggle, PortalLogoutButton } from "../portal-ui";
import { portalWords } from "../server";
import LocationList from "./list";

export const dynamic = "force-dynamic";

// "Which location?": shown after login when one email opens several
// accounts, and from "Switch location" on the home screen.
export default async function PortalLocationsPage() {
  if (!newPortalOn()) redirect("/portal/dashboard");
  const login = await getPortalLogin();
  if (!login) redirect("/portal/login");
  const { words } = await portalWords();

  return (
    <Screen title={words.whichLocation} subtitle={words.whichLocationText} backHref={login.current ? "/portal" : undefined} headerRight={<LangToggle />}>
      <LocationList
        locations={login.accounts.map((a) => ({ accountId: a.accountId, accountName: a.accountName, address: a.address }))}
        currentId={login.current?.accountId ?? ""}
      />
      <div className="ui-actions-row">
        <PortalLogoutButton />
      </div>
    </Screen>
  );
}
