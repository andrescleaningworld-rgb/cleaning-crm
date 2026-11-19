// "?returnTo=": where a form goes after Save when it was opened from another
// page (an account's page, Visits -> "Not visited"). Only a page of this app
// ("/accounts/…", "/visits?…"): never another site, so a link cannot send
// anyone away after they save.

/** The returnTo path when it is a page of this app, else "". */
export function safeReturnTo(value: string | null | undefined): string {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "";
  return path.slice(0, 1000);
}

/** `href` with returnTo added (joined with ? or &). */
export function withReturnTo(href: string, returnTo: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
}
