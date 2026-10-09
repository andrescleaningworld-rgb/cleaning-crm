// The Cleaning calendar (/board/calendar): Today, Week and Month. Staff only
// (proxy.ts default gate). Hidden behind FEATURE_PIN_BOARD like the board.

import { notFound } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import CalendarClient from "./calendar-client";

export const dynamic = "force-dynamic";

export default function BoardCalendarPage() {
  if (!boardFlagOn()) notFound();
  return <CalendarClient />;
}
