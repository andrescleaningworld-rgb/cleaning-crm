// Extra Jobs API (/extra-jobs). Staff only (proxy.ts default gate).
// Postgres only; see lib/pg/extra-jobs.ts. Where the tables are not in the
// database yet, GET answers { ready: false } and the pages say so.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { sendExtraJobDone, sendExtraJobSetUp } from "@/lib/extraJobEmail";
import { SOURCES, checkNewExtraJob, isDay, type ExtraJob, type ExtraJobSource, type NewExtraJob } from "@/lib/extraJobs";
import { createExtraJob, extraJobsReady, finishExtraJob, getExtraJob, getFormChoices, getJobAccount, getPayReport, listExtraJobs, stampEmailed } from "@/lib/pg/extra-jobs";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

/** Tells the office. A failed email never undoes the save; the screen says the email did not go out. */
async function tellOffice(job: ExtraJob, which: "setup" | "done", origin: string): Promise<boolean> {
  try {
    const sent = which === "setup" ? await sendExtraJobSetUp(job, origin) : await sendExtraJobDone(job, origin);
    if (sent) await stampEmailed(job.id, which);
    return sent;
  } catch (error) {
    console.error(`[extra-jobs] ${which} email failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await extraJobsReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const params = request.nextUrl.searchParams;
    const view = params.get("view");

    if (view === "form") {
      const identity = await getAdminIdentity(request);
      return NextResponse.json({ success: true, ready: true, ...(await getFormChoices(clean(identity?.name))) }, noStore);
    }

    if (view === "pay") {
      const from = clean(params.get("from"));
      const to = clean(params.get("to"));
      if (!isDay(from) || !isDay(to) || to < from) return refuse("Pick the first and the last day of the pay period.");
      return NextResponse.json({ success: true, ready: true, from, to, rows: await getPayReport(from, to) }, noStore);
    }

    const id = clean(params.get("id"));
    if (id) {
      const job = await getExtraJob(id);
      if (!job) return refuse("That extra job was not found.", 404);
      return NextResponse.json({ success: true, ready: true, job, account: await getJobAccount(job.accountId) }, noStore);
    }

    return NextResponse.json({ success: true, ready: true, jobs: await listExtraJobs() }, noStore);
  } catch (error) {
    console.error("[extra-jobs GET]", error instanceof Error ? error.message : error);
    return refuse("The extra jobs did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await extraJobsReady())) return refuse("Extra Jobs is not set up in this database yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const origin = request.nextUrl.origin;

    // Step 2: the manager sets it up. Also creates the one-time Sale, then tells the office (step 3).
    if (action === "create") {
      const source = clean(body.source) as ExtraJobSource;
      if (!SOURCES.some((option) => option.value === source)) return refuse("Pick how it came in.");
      const input: NewExtraJob = {
        accountId: clean(body.accountId),
        accountName: clean(body.accountName),
        source,
        description: clean(body.description),
        jobDate: clean(body.jobDate),
        customerPrice: Math.round(Number(body.customerPrice) * 100) / 100,
        subId: clean(body.subId),
        subName: clean(body.subName),
        subPay: Math.round(Number(body.subPay) * 100) / 100,
        soldBy: clean(body.soldBy),
      };
      const problem = checkNewExtraJob(input);
      if (problem) return refuse(problem);
      const job = await createExtraJob(input, by);
      const emailed = await tellOffice(job, "setup", origin);
      return NextResponse.json({ success: true, job: { ...job, setupEmailed: emailed }, emailed });
    }

    // Step 4: the manager taps Done (at least one after photo), which tells the office it is ready to invoice (step 5).
    if (action === "done") {
      const result = await finishExtraJob(clean(body.id), by, clean(body.note));
      if (result === "not-found") return refuse("That extra job was not found.", 404);
      if (result === "no-photo") return refuse("Add at least one after photo first.");
      if (result === "already") return refuse("This job was already marked done.", 409);
      const emailed = await tellOffice(result, "done", origin);
      return NextResponse.json({ success: true, job: { ...result, doneEmailed: emailed }, emailed });
    }

    // An email that did not go out can be sent again from the job's page.
    if (action === "resendEmail") {
      const job = await getExtraJob(clean(body.id));
      if (!job) return refuse("That extra job was not found.", 404);
      const emailed = await tellOffice(job, job.status === "done" ? "done" : "setup", origin);
      if (!emailed) return refuse("The email did not go out. Tell the office yourself for now.", 502);
      return NextResponse.json({ success: true, emailed });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[extra-jobs POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
