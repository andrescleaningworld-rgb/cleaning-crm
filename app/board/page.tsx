// The Office Pin Board (/board): Whole board and My square. Staff only
// (proxy.ts default gate). Hidden behind FEATURE_PIN_BOARD: while the
// switch is off this address does not exist.

import { notFound } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import BoardClient from "./board-client";

export const dynamic = "force-dynamic";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!boardFlagOn()) notFound();
  const { tab } = await searchParams;
  // No tab asked for: a phone opens "My square", a wide screen the whole board.
  return <BoardClient startTab={tab === "mine" ? "mine" : "board"} phoneOpensMine={tab !== "mine" && tab !== "board"} />;
}
