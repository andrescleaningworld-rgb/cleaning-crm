// Office TV mode (/board/tv?k=<TV link token>): the board, bigger and
// read-only. No login (see proxy.ts); the API checks the TV link. Hidden
// behind FEATURE_PIN_BOARD like the rest of the board.

import { notFound } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import TvClient from "./tv-client";

export const dynamic = "force-dynamic";

export default async function BoardTvPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  if (!boardFlagOn()) notFound();
  const { k } = await searchParams;
  return <TvClient token={typeof k === "string" ? k : ""} />;
}
