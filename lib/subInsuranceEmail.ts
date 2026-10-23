// The sub insurance reminder emails (lib/pg/sub-insurance.ts): one to the
// office (info@), and one to the sub in English, Spanish and Portuguese
// (no language is on file for subs, so all three, one under the other),
// with the sub portal link and "Upload my insurance".

import { SUB_INSURANCE_WORDS, INSURANCE_LOCALE, niceDay, type InsuranceLang } from "@/lib/subInsurance";
import { emailButtonHtml, escHtml, simpleEmailHtml } from "@/lib/simpleEmail";

type Mail = { subject: string; html: string; text: string };

export function officeInsuranceEmail(input: { subName: string; company: string; expiresOn: string; expired: boolean; link: string }): Mail {
  const day = niceDay(input.expiresOn);
  const who = input.company && input.company !== input.subName ? `${input.subName} (${input.company})` : input.subName;
  const line = input.expired ? `${who}'s insurance expired on ${day}.` : `${who}'s insurance expires on ${day}.`;
  const subject = `${input.expired ? "Insurance expired" : "Insurance expiring"}: ${input.subName} – ${day}`;
  return {
    subject,
    html: simpleEmailHtml({
      title: input.expired ? "Insurance expired" : "Insurance expiring soon",
      subtitle: who,
      blocks: [escHtml(line), "Ask the sub for the new COI, then upload it on their page in Sub Center."],
      buttonsHtml: emailButtonHtml({ label: "Open Sub Center", url: input.link }),
    }),
    text: [subject, "", line, "Ask the sub for the new COI, then upload it on their page in Sub Center.", input.link].join("\n"),
  };
}

export type SubReminderKind = "missing" | "soon" | "expired";

export function subInsuranceEmail(input: { subName: string; expiresOn: string; kind: SubReminderKind; portalUrl: string }): Mail {
  const langs: InsuranceLang[] = ["en", "es", "pt"];
  const blocks = langs.map((lang) => {
    const w = SUB_INSURANCE_WORDS[lang];
    const day = niceDay(input.expiresOn, INSURANCE_LOCALE[lang]);
    const what = input.kind === "missing" ? w.emailMissing : input.kind === "expired" ? w.emailExpired(day) : w.emailSoon(day);
    return [w.emailHello(input.subName || "there"), what, w.emailAsk];
  });
  const en = SUB_INSURANCE_WORDS.en;
  const es = SUB_INSURANCE_WORDS.es;
  return {
    subject: `${en.emailSubject(input.kind)} / ${es.emailSubject(input.kind).split(" – ")[0]}`,
    html: simpleEmailHtml({
      title: en.emailSubject(input.kind).split(" – ")[0],
      subtitle: `${en.upload} · ${es.upload} · ${SUB_INSURANCE_WORDS.pt.upload}`,
      blocks: blocks.map((lines, index) => `${index > 0 ? `<hr style="border:none;border-top:1px solid #dbeafe;margin:0 0 12px;">` : ""}${lines.map(escHtml).join("<br>")}`),
      buttonsHtml: emailButtonHtml({ label: `${en.emailButton} / ${es.emailButton}`, url: input.portalUrl }),
    }),
    text: [...blocks.map((lines) => lines.join("\n")), input.portalUrl].join("\n\n"),
  };
}
