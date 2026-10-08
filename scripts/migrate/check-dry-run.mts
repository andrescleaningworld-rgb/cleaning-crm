// Proves OUTBOUND_DRY_RUN=1 stops every sender. Nothing leaves this machine:
// global fetch is replaced with a trap that fails the test if it is called.
// Run: npx tsx scripts/migrate/check-dry-run.mts
process.env.OUTBOUND_DRY_RUN = "1";
// Dummy values so a sender that ignored the dry-run would try to send (and hit the trap).
process.env.TEXTBELT_API_KEY = "dry-run-test";
process.env.ONESIGNAL_REST_API_KEY = "dry-run-test";
process.env.GOOGLE_CALENDAR_ID = "dry-run-test";
process.env.GOOGLE_DRIVE_FOLDER_ID = "dry-run-test";

let fetchCalls = 0;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  fetchCalls++;
  throw new Error(`fetch was called during dry-run: ${String(input).slice(0, 60)}`);
}) as typeof fetch;

const { sendSms } = await import("../../lib/sms");
const { sendInternalNotification, sendSubcontractorNotification, sendPortalNotification } = await import("../../lib/email");
const { sendPush } = await import("../../lib/push");
const { createCalendarEventForToDo, updateCalendarEventForToDo, deleteCalendarEventForToDo } = await import("../../lib/googleCalendar");
const { uploadPhotoToDrive } = await import("../../lib/googleDrive");
const { fetchAppsScript, fetchAppsScriptDirect } = await import("../../lib/appsScriptFetch");

let failed = false;
const check = (label: string, ok: boolean) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
};

const SCRIPT = "https://script.example.invalid/exec";
const post = (action: string): RequestInit => ({ method: "POST", body: JSON.stringify({ action }) });

check("sms", (await sendSms("5555550100", "test", "check-dry-run")).success);
check("internal email", await sendInternalNotification("test", ["line"]));
check("sub email", await sendSubcontractorNotification("nobody@example.invalid", "test", ["line"]));
await sendPortalNotification({ subject: "test", accountName: "Test", accountId: "T-1", lines: ["line"] });
check("portal email", true);
check("push", (await sendPush("STF-TEST", "title", "body", "/", "check-dry-run")).success);
const created = await createCalendarEventForToDo({
  syncToCalendar: true, dueDate: "2026-10-08", accountName: "Test", why: "test", status: "Open", notes: "", assignedTo: "",
} as Parameters<typeof createCalendarEventForToDo>[0]);
check("calendar create", !created.failed && String(created.eventId).startsWith("dry-run-"));
check("calendar update", !(await updateCalendarEventForToDo({ eventId: "x", accountName: "Test", why: "test", status: "Done" })).failed);
check("calendar delete", !(await deleteCalendarEventForToDo("x")).failed);
check("drive upload", (await uploadPhotoToDrive(Buffer.from("x"), "a.jpg", "image/jpeg", "T-1")).includes("dry-run"));

const fake = async (r: Response) => ((await r.json()) as { dryRun?: boolean }).dryRun === true;
check("Apps Script POST write (addVisit)", await fake(await fetchAppsScript(SCRIPT, post("addVisit"))));
check("Apps Script direct POST write (addAccount)", await fake(await fetchAppsScriptDirect(SCRIPT, post("addAccount"))));
check("Apps Script GET that sends email (sendNewAccountPacket)", await fake(await fetchAppsScriptDirect(`${SCRIPT}?action=sendNewAccountPacket`, { method: "GET" })));
check("Apps Script POST with no action", await fake(await fetchAppsScriptDirect(SCRIPT, { method: "POST", body: "{}" })));
check("no network call so far", fetchCalls === 0);

// Reads must still go through (here: reach the trap).
const reachesNetwork = async (run: () => Promise<Response>) => {
  const before = fetchCalls;
  await run().catch(() => undefined);
  return fetchCalls > before;
};
check("Apps Script GET read passes through", await reachesNetwork(() => fetchAppsScriptDirect(`${SCRIPT}?action=getVisits`)));
check("Apps Script POST read passes through", await reachesNetwork(() => fetchAppsScriptDirect(SCRIPT, post("getSubcontractorPortalByEmail"))));

process.exitCode = failed ? 1 : 0;
