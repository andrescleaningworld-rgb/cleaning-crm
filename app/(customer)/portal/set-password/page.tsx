import { redirect } from "next/navigation";
import { Screen } from "@/app/ui";
import { newPortalOn } from "@/lib/portalSession";
import { emailForToken } from "@/lib/pg/portal-auth";
import { LangToggle } from "../portal-ui";
import { portalWords } from "../server";
import SetPasswordForm from "./form";

export const dynamic = "force-dynamic";

// The page a "Set your password" link opens.
export default async function PortalSetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!newPortalOn()) redirect("/portal/login");
  const token = (await searchParams).token ?? "";
  const email = await emailForToken(token);
  const { words } = await portalWords();

  if (!email) {
    return (
      <Screen title={words.linkBadTitle} subtitle={words.linkBadText} headerRight={<LangToggle />}>
        <a href="/portal/forgot" className="ui-btn ui-btn-main">
          {words.askNewLink}
        </a>
        <a href="/portal/login" className="ui-btn ui-btn-second">
          {words.backToLogin}
        </a>
      </Screen>
    );
  }
  return <SetPasswordForm token={token} email={email} />;
}
