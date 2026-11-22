"use client";

// The Pin Board's List view (docs/unification-plan.md, Phase 6): the real To-Do
// screen under the board's tabs, with all it does (filters, bulk edit, many
// accounts at once, print, outcomes, finishing a visit). It is the same screen
// and the same data as /to-do, so the two can never disagree.

import { Tabs } from "@/app/ui";
import ToDoPage from "../../to-do/page";
import { BOARD_TABS, useBoardTabs } from "../board-client";

export default function BoardListClient() {
  const changeTab = useBoardTabs("list");
  return (
    <div className="ui-screen">
      <div className="no-print">
        <Tabs tabs={BOARD_TABS} value="list" onChange={changeTab} label="Pin Board views" />
      </div>
      <ToDoPage />
    </div>
  );
}
