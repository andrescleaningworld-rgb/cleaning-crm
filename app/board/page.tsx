// The Office Pin Board (/board): Whole board and My square. Staff only
// (proxy.ts default gate). It is the home page: login lands here.
//
// Behind FEATURE_PIN_BOARD. While the switch is off there is no board, so
// this address sends people to Overview (the old dashboard) instead: a
// login, the "Board" menu entry and every "home" link still land somewhere
// that works.

import { redirect } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import BoardClient from "./board-client";

export const dynamic = "force-dynamic";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!boardFlagOn()) redirect("/");
  const { tab } = await searchParams;
  // No tab asked for: a phone opens "My square", a wide screen the whole board.
  return <BoardClient startTab={tab === "mine" ? "mine" : "board"} phoneOpensMine={tab !== "mine" && tab !== "board"} />;
}
