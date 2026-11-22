// "My to-dos" in the Sub Portal (FEATURE_MY_TODOS). Only the logged-in sub's own
// tasks, from their session, never from the request. No money and no office
// notes: lib/pg/cw-now-tasks.ts listMyTodos picks the fields.
//
// GET         { on, language, tasks }
// GET ?full=1 the same, with each account's address (for printing)

import { NextRequest } from "next/server";
import { filesJson } from "@/lib/files";
import { readSubSession } from "@/lib/subDevice";
import { rolloutOn } from "@/lib/rollout";
import { isCrewLang } from "@/lib/crewLinkPeople";
import { getSql } from "@/lib/db";
import { cwNowTasksReady, listMyTodos, subIdOfSession } from "@/lib/pg/cw-now-tasks";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  try {
    if (!rolloutOn("MY_TODOS") || !(await cwNowTasksReady())) return filesJson({ success: true, on: false }, { headers: noStore });
    const session = await readSubSession(request, filesJson({}));
    if (!session.subcontractorEmail) return filesJson({ success: false, error: "Not logged in." }, { status: 401, headers: noStore });
    const subId = await subIdOfSession(session.subcontractorId ?? "", session.subcontractorEmail);
    if (!subId) return filesJson({ success: true, on: true, language: "en", tasks: [] }, { headers: noStore });
    const [tasks, rows] = await Promise.all([
      listMyTodos(subId, { withLocation: request.nextUrl.searchParams.get("full") === "1" }),
      getSql()`SELECT language FROM subcontractors WHERE id = ${subId} LIMIT 1`,
    ]);
    const language: unknown = rows[0]?.language;
    return filesJson({ success: true, on: true, language: isCrewLang(language) ? language : "en", tasks }, { headers: noStore });
  } catch (error) {
    console.error("[my-todos GET]", error instanceof Error ? error.message : error);
    return filesJson({ success: false, error: "It did not load." }, { status: 500, headers: noStore });
  }
}
