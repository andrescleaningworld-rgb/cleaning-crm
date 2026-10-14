// Where "Close preview" goes: the admin page the preview was opened from.
// Only a path on this site; anything else goes to the Crew Link page.
export function previewBackHref(back: string | null | undefined): string {
  const value = String(back ?? "");
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/crew-link";
}
