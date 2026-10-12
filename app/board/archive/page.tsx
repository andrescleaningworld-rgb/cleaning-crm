// The Pin Board's Archive (/board/archive): finished papers that have left
// the Done tray. Nothing is ever deleted; a paper can be found here and put
// back on the board. Staff only (proxy.ts default gate). Hidden behind
// FEATURE_PIN_BOARD like the board.

import { notFound } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import ArchiveClient from "./archive-client";

export const dynamic = "force-dynamic";

export default function BoardArchivePage() {
  if (!boardFlagOn()) notFound();
  return <ArchiveClient />;
}
