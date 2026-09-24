// One date/time format for every crew submission (Crew Link + Team Hub):
// "Sep 24, 2026 · 3:42 PM", always in the company timezone
// (America/New_York) no matter where the code runs — the server (UTC) for
// emails and the PDF, or a phone/browser set to another zone. Used on the
// crew forms, the staff queue, the account page, emails and printouts.
import { TEAM_HUB_TIMEZONE } from "@/lib/teamHubTimezone";

export function formatCrewDateTime(value: string | Date, lang: "en" | "es" | "pt" = "en"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";
  const locale = lang === "es" ? "es-US" : lang === "pt" ? "pt-BR" : "en-US";
  const day = date.toLocaleDateString(locale, { timeZone: TEAM_HUB_TIMEZONE, month: "short", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString(locale, { timeZone: TEAM_HUB_TIMEZONE, hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}
