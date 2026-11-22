// The Pin Board's List view. Staff only (proxy.ts default gate). With the board
// switched off, this address goes to the To-Do page, which is the same list.

import { redirect } from "next/navigation";
import { boardFlagOn } from "@/lib/pg/board";
import BoardListClient from "./list-client";

export const dynamic = "force-dynamic";

export default function BoardListPage() {
  if (!boardFlagOn()) redirect("/to-do");
  return <BoardListClient />;
}
