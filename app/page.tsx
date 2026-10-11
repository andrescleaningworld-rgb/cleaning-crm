// The app's front door ("/"): staff always open on the Pin Board. This is
// where a login, the home-screen icon and every "home" link land.
//
// While FEATURE_PIN_BOARD is off there is no board, so Overview (the old
// dashboard, now at /overview) shows here instead. Subs and customers never
// reach this page: proxy.ts sends them to their own portal first.

import { redirect } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import OverviewPage from "./overview/page";

export const dynamic = "force-dynamic";

export default function HomePage() {
  if (boardFlagOn()) redirect("/board");
  return <OverviewPage />;
}
