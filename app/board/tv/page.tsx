// Office TV mode (/tv, /board/tv, or /board/tv?k=<TV link token>): the
// board, bigger and read-only. No login (see proxy.ts); the API checks the
// TV link. A TV with no link shows a 6-digit code to connect it from a phone
// (tv-gate.tsx). Hidden behind FEATURE_PIN_BOARD like the rest of the board.

import { notFound } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import TvGate from "./tv-gate";

export const dynamic = "force-dynamic";

export default async function BoardTvPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  if (!boardFlagOn()) notFound();
  const { k } = await searchParams;
  return <TvGate token={typeof k === "string" ? k : ""} />;
}
