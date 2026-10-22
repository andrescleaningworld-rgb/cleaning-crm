// "NEW ACCEPTED ACCOUNT": the email to crm@ when the Markate import brings in
// a new estimate (lib/pg/markate.ts sendEstimateEmails). The Welcome Packet's
// colors and logo on a white page. Plain TS, no server imports.

import { WELCOME_COLORS, WELCOME_LOGO_URL } from "@/lib/welcomePacket";

export const MARKATE_EMAIL_TO = "crm@cleaningworldinc.com";

export type EstimateEmailData = {
  /** The name the CRM uses (the company first): the subject and the header. */
  customerName: string;
  /** Markate's own name for the customer. */
  displayName: string;
  company: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  monthlyPrice: number;
  total: number;
  matchedItem: string;
  matchedWhy: string;
  /** YYYY-MM-DD, "" when Markate did not say. */
  acceptedDay: string;
  estimateNumber: string;
  crmUrl: string;
  markateUrl: string;
};

const C = WELCOME_COLORS;
const FONT = "font-family:Arial,Helvetica,sans-serif;";
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
export const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dayText(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return "Not given";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function estimateEmailSubject(data: Pick<EstimateEmailData, "customerName" | "monthlyPrice">): string {
  return `NEW ACCEPTED ACCOUNT: ${data.customerName || "Markate customer"} – ${dollars(data.monthlyPrice)}/month`;
}

function rows(data: EstimateEmailData): { label: string; value: string }[] {
  return [
    { label: "Customer", value: data.displayName || data.customerName || "Not given" },
    { label: "Company", value: data.company || "Not given" },
    { label: "Service address", value: data.address || "Not given" },
    { label: "Contact", value: data.contactName || "Not given" },
    { label: "Phone", value: data.phone || "Not given" },
    { label: "Email", value: data.email || "Not given" },
    { label: "Monthly price", value: `${dollars(data.monthlyPrice)} a month (the recurring items added up)` },
    { label: "Estimate total", value: dollars(data.total) },
    { label: "Recurring item", value: `${data.matchedItem}${data.matchedWhy === "per month" ? " (says per month)" : ""}` },
    { label: "Accepted", value: dayText(data.acceptedDay) },
    ...(data.estimateNumber ? [{ label: "Estimate number", value: data.estimateNumber }] : []),
  ];
}

/** The whole HTML page. Stays light when the phone is in dark mode, like the Welcome Packet. */
export function estimateEmailHtml(data: EstimateEmailData): string {
  const table = rows(data)
    .map(
      (row) =>
        `<tr>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};background:#ffffff;font-size:13px;font-weight:700;color:${C.label};width:38%;vertical-align:top;">${esc(row.label)}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};background:#ffffff;font-size:14px;color:${C.text};vertical-align:top;">${esc(row.value)}</td>` +
        `</tr>`
    )
    .join("");

  // A table button: Outlook draws it too.
  const button =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 16px 8px;"><tr>` +
    `<td bgcolor="${C.bar}" style="background:${C.bar};border-radius:8px;">` +
    `<a href="${esc(data.crmUrl)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">Open in the CRM</a>` +
    `</td></tr></table>`;

  const markateLink = data.markateUrl
    ? `<p style="margin:6px 16px 0;font-size:14px;"><a href="${esc(data.markateUrl)}" style="color:${C.bar};text-decoration:underline;">View estimate in Markate</a></p>`
    : "";

  const body =
    `<div style="background:#ffffff;padding:18px 0;text-align:center;">` +
    `<img src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." width="220" style="width:220px;max-width:70%;height:auto;" />` +
    `</div>` +
    `<div style="background:${C.header};border-bottom:4px solid ${C.accent};padding:16px;">` +
    `<div style="font-size:21px;font-weight:700;color:#ffffff;">NEW ACCEPTED ACCOUNT</div>` +
    `<div style="font-size:14px;color:${C.tagline};margin-top:4px;">${esc(data.customerName || "Markate customer")} · ${esc(dollars(data.monthlyPrice))} a month</div>` +
    `</div>` +
    `<p style="margin:14px 16px;font-size:14px;line-height:1.55;color:${C.text};">A commercial customer accepted an estimate in Markate with a recurring item. It is waiting in Accounts Center, New accounts, From Markate. Tap Start new account there to set it up, or Skip.</p>` +
    `<table ${TABLE} style="border-collapse:collapse;border:1px solid ${C.border};">${table}</table>` +
    button +
    markateLink +
    `<div style="background:#ffffff;border-top:2px solid ${C.accent};color:${C.muted};padding:14px 16px;margin-top:22px;text-align:center;font-size:12px;line-height:1.7;">` +
    `Sent by the Cleaning World CRM when the Markate check finds a new accepted estimate.` +
    `</div>`;

  return (
    `<!DOCTYPE html><html lang="en" style="background:#ffffff;"><head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="color-scheme" content="light only" />` +
    `<meta name="supported-color-schemes" content="light only" />` +
    `<title>${esc(estimateEmailSubject(data))}</title>` +
    `<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>` +
    `</head>` +
    `<body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff;${FONT}color:${C.text};">` +
    `<table ${TABLE} bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:16px 10px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;"><tr><td style="text-align:left;${FONT}color:${C.text};">` +
    body +
    `</td></tr></table>` +
    `</td></tr></table>` +
    `</body></html>`
  );
}

/** The plain-text twin, for mail apps that do not show HTML. */
export function estimateEmailText(data: EstimateEmailData): string {
  return [
    "NEW ACCEPTED ACCOUNT",
    "",
    "A commercial customer accepted an estimate in Markate with a recurring item. It is waiting in Accounts Center, New accounts, From Markate.",
    "",
    ...rows(data).map((row) => `${row.label}: ${row.value}`),
    "",
    `Open in the CRM: ${data.crmUrl}`,
    ...(data.markateUrl ? [`View estimate in Markate: ${data.markateUrl}`] : []),
  ].join("\n");
}
