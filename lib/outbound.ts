// OUTBOUND_DRY_RUN=1 stops the app from reaching the outside world while
// testing: texts (Textbelt), email (Resend / Gmail), push (OneSignal), Google
// Calendar, Google Drive uploads, and Apps Script writes. Each sender logs
// "[dry-run] would send …" and returns the same shape as a successful send.
//
// Default is off: unset or any other value sends for real, so production is
// unaffected. Direct Google Sheets writes are NOT covered here — when testing
// locally with an area still on Sheets, don't save.

export function isOutboundDryRun(): boolean {
  return process.env.OUTBOUND_DRY_RUN === "1";
}

// Keeps log lines short and free of long bodies; never pass secrets here.
export function logDryRun(channel: string, detail: string): void {
  const oneLine = detail.replace(/\s+/g, " ").trim();
  console.log(`[dry-run] would send ${channel}: ${oneLine.length > 300 ? `${oneLine.slice(0, 300)}…` : oneLine}`);
}
