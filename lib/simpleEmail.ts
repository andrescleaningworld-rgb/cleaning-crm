// One plain Cleaning World email layout for the reminder emails (sub
// insurance, customer check-in): the logo, a navy title bar, a few short
// lines, big buttons, a small footer. White, light in dark mode, the same
// colors as the Welcome Packet. Plain TS (no server imports).

import { WELCOME_COLORS as C, WELCOME_LOGO_URL } from "@/lib/welcomePacket";

export const BRAND_GREEN = "#15803d";

export function escHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export type EmailButton = { label: string; url: string; color?: string };

/** A big tappable button (a table cell, so every mail app draws it). */
export function emailButtonHtml(button: EmailButton, size: "big" | "huge" = "big"): string {
  const pad = size === "huge" ? "18px 34px" : "14px 26px";
  const font = size === "huge" ? "26px" : "17px";
  const color = button.color ?? BRAND_GREEN;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:6px;"><tr>` +
    `<td bgcolor="${color}" style="background:${color};border-radius:12px;">` +
    `<a href="${escHtml(button.url)}" style="display:inline-block;padding:${pad};font-size:${font};font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${escHtml(button.label)}</a>` +
    `</td></tr></table>`
  );
}

/**
 * The whole email. `blocks` are already-safe HTML pieces (use escHtml on
 * anything typed); `buttonsHtml` sits centred under them.
 */
export function simpleEmailHtml(input: { title: string; subtitle?: string; blocks: string[]; buttonsHtml?: string; footerHtml?: string }): string {
  const body =
    `<div style="text-align:center;padding:16px 0;"><img src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." width="200" style="width:200px;max-width:70%;height:auto;" /></div>` +
    `<div style="background:${C.header};border-bottom:4px solid ${C.accent};padding:14px 16px;">` +
    `<div style="font-size:20px;font-weight:700;color:#ffffff;">${escHtml(input.title)}</div>` +
    (input.subtitle ? `<div style="font-size:14px;color:${C.tagline};margin-top:3px;">${escHtml(input.subtitle)}</div>` : "") +
    `</div>` +
    input.blocks.map((block) => `<div style="margin:14px 16px 0;font-size:15px;line-height:1.55;color:${C.text};">${block}</div>`).join("") +
    (input.buttonsHtml ? `<div style="text-align:center;margin:20px 8px 6px;">${input.buttonsHtml}</div>` : "") +
    `<div style="border-top:2px solid ${C.accent};margin-top:20px;padding:12px 16px;text-align:center;font-size:12px;line-height:1.7;color:${C.muted};">` +
    `Cleaning World Inc. · 201-487-1313 · cleaningworldinc.com` +
    (input.footerHtml ? `<br>${input.footerHtml}` : "") +
    `</div>`;
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="color-scheme" content="light only" /><title>${escHtml(input.title)}</title></head>` +
    `<body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:${C.text};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td align="center" style="padding:12px 8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;"><tr><td style="text-align:left;">` +
    body +
    `</td></tr></table></td></tr></table></body></html>`
  );
}
