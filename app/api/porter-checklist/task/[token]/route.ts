// Public, no-login route (proxy.ts PUBLIC_PATHS covers "/api/porter-checklist"):
// the sub's CW Now to-do. The private token opens this one task and nothing
// else: no money, no other accounts, no office names. File links are signed
// and short-lived (filesJson).
//
// GET                         the task
// POST { action: "seen" }     the page really opened (a link preview runs no page code, so it never counts)
// POST { action: "note", name, note }
// POST { action: "photo", name, url, fileName, size, contentType }   after the upload route
// POST { action: "done", name }

import { after, NextRequest } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { filesJson } from "@/lib/files";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { isTaskToken } from "@/lib/cwNowTasks";
import { CwNowTaskError, addNoteFromLink, addPhotoFromLink, cwNowTasksReady, doneFromLink, markSeen, publicTask } from "@/lib/pg/cw-now-tasks";

type Context = { params: Promise<{ token: string }> };
const noStore = { "Cache-Control": "no-store" };
const answer = (data: Record<string, unknown>, status = 200) => filesJson(data, { status, headers: noStore });
const gone = () => answer({ success: false, error: "Not available." }, 404);
const clean = (value: unknown) => String(value ?? "").trim();

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { token } = await params;
    if (!isTaskToken(token)) return gone();
    if (!(await checkRateLimit(`cwnow-task-get:${token}`))) return answer({ success: false, error: "Too many requests. Wait a minute." }, 429);
    if (!(await cwNowTasksReady())) return gone();
    const task = await publicTask(token);
    return task ? answer({ success: true, task }) : gone();
  } catch (error) {
    console.error("[cw-now task GET]", error instanceof Error ? error.message : error);
    return answer({ success: false, error: "Something went wrong." }, 500);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { token } = await params;
    if (!isTaskToken(token)) return gone();
    if (!(await checkRateLimit(`cwnow-task-post:${token}`))) return answer({ success: false, error: "Too many requests. Wait a minute." }, 429);
    if (!(await cwNowTasksReady())) return gone();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const name = clean(body.name).slice(0, 80);

    if (action === "seen") {
      // Office staff opening the link to check it does not count as the sub seeing it.
      if (!(await getAdminIdentity(request))) await markSeen(token);
      return answer({ success: true });
    }
    if (action === "note") {
      const follow = await addNoteFromLink(token, name, clean(body.note));
      if (!follow) return gone();
      after(follow);
      return answer({ success: true });
    }
    if (action === "photo") {
      const saved = await addPhotoFromLink(token, name, { url: clean(body.url), name: clean(body.fileName), size: Number(body.size) || 0, contentType: clean(body.contentType) });
      return saved ? answer({ success: true }) : answer({ success: false, error: "The photo was not saved." }, 400);
    }
    if (action === "done") {
      const follow = await doneFromLink(token, name, request.nextUrl.origin);
      if (follow) after(follow);
      // Tapped twice, or on two phones: it is done either way.
      return answer({ success: true });
    }
    return answer({ success: false, error: "Unknown action." }, 400);
  } catch (error) {
    if (error instanceof CwNowTaskError) return answer({ success: false, error: error.message }, 400);
    console.error("[cw-now task POST]", error instanceof Error ? error.message : error);
    return answer({ success: false, error: "Something went wrong." }, 500);
  }
}
