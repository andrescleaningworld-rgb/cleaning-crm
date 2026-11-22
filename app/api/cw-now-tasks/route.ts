// CW Now to-dos, the office side (the CW Now square on the Pin Board). Staff
// only: proxy.ts's default gate, and every call checks the login again.
//
// GET  ?view=form[&accountId=]  the subs, the account's assigned sub, whether private files and text links are on
// GET  ?id=<task>               one task for its card, with its private link
// POST action create | share | done | cancel

import { after, NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { isCwNowShareMethod, isTaskListStatus } from "@/lib/cwNowTasks";
import { privateStoreOn } from "@/lib/files";
import { smsLinksOn } from "@/lib/sms";
import {
  CwNowTaskError,
  assignedSubId,
  cancelTask,
  createTask,
  cwNowTasksReady,
  deliverNewTask,
  listStaffTasks,
  listTaskSubs,
  shareTask,
  staffFinishTask,
  staffTask,
  type NewTaskFile,
} from "@/lib/pg/cw-now-tasks";

const clean = (value: unknown) => String(value ?? "").trim();
const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (!(await cwNowTasksReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const params = request.nextUrl.searchParams;
    if (params.get("view") === "form") {
      const accountId = clean(params.get("accountId"));
      if (accountId) return NextResponse.json({ success: true, ready: true, assignedSubId: await assignedSubId(accountId) }, noStore);
      return NextResponse.json({ success: true, ready: true, subs: await listTaskSubs(), privateFiles: privateStoreOn(), linksOn: smsLinksOn() }, noStore);
    }
    // The "Sub to-dos" view, the office calendar and the printouts.
    if (params.get("view") === "list") {
      const day = (name: string) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(params.get(name))) ? clean(params.get(name)) : "");
      const status = params.get("status");
      const listId = Number(params.get("id"));
      const [tasks, subs] = await Promise.all([
        listStaffTasks({
          id: Number.isInteger(listId) && listId > 0 ? listId : undefined,
          subId: clean(params.get("subId")),
          accountId: clean(params.get("accountId")),
          status: isTaskListStatus(status) ? status : "all",
          from: day("from"),
          to: day("to"),
          withLocation: params.get("full") === "1",
        }),
        listTaskSubs(),
      ]);
      return NextResponse.json({ success: true, ready: true, tasks, subs }, noStore);
    }
    const id = Number(params.get("id"));
    if (!Number.isInteger(id) || id <= 0) return refuse("Which task?");
    const task = await staffTask(id, request.nextUrl.origin);
    return task ? NextResponse.json({ success: true, ready: true, task }, noStore) : refuse("That task was not found.", 404);
  } catch (error) {
    console.error("[cw-now-tasks GET]", error instanceof Error ? error.message : error);
    return refuse("It did not load. Try again.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    if (!(await cwNowTasksReady())) return refuse("CW Now to-dos are not turned on here yet.", 409);
    const by = clean(identity.name) || "Staff";
    const byStaffId = clean(identity.staffId);
    const origin = request.nextUrl.origin;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "create") {
      const files = (Array.isArray(body.files) ? body.files : []) as NewTaskFile[];
      const id = await createTask({
        accountId: clean(body.accountId),
        subId: clean(body.subId),
        task: clean(body.task),
        dueDate: clean(body.dueDate),
        dueTime: clean(body.dueTime),
        urgent: body.urgent === true,
        files,
        by,
        byStaffId,
      });
      after(() => deliverNewTask(id, origin));
      return NextResponse.json({ success: true, id }, noStore);
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return refuse("Which task?");

    if (action === "share") {
      if (!isCwNowShareMethod(body.method)) return refuse("Pick how to send it.");
      await shareTask(id, body.method, by, origin);
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "done") {
      const follow = await staffFinishTask(id, by, byStaffId, origin);
      if (!follow) return refuse("This task is already closed.", 409);
      after(follow);
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "cancel") {
      const follow = await cancelTask(id, by);
      if (!follow) return refuse("This task is already closed.", 409);
      after(follow);
      return NextResponse.json({ success: true }, noStore);
    }

    return refuse("Unknown action.");
  } catch (error) {
    if (error instanceof CwNowTaskError) return refuse(error.message);
    console.error("[cw-now-tasks POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
