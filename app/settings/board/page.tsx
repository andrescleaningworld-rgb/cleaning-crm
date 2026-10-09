// Settings -> Pin Board: how many days before a paper turns yellow, and the
// secret links that open Office TV mode. Owner only. Hidden behind
// FEATURE_PIN_BOARD like the board itself.

import { notFound } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import BoardSettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

export default function BoardSettingsPage() {
  if (!boardFlagOn()) notFound();
  return <BoardSettingsClient />;
}
