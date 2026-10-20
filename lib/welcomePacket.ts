// The customer Welcome Packet: one template, used two ways. Every word, row
// and color is defined once here; welcomePacketHtml() below draws it as the
// email body (and the preview in the app), and lib/pdf/welcome-packet.tsx
// draws the same content as the PDF attachment. The design copies
// docs/welcome-packet.pdf (2 pages), plus a "Prepared for" line under the
// header. Plain TS, no server-only imports.

export type WelcomeSupplyMode = "included" | "billed" | "customer";

export type WelcomePacketData = {
  accountName: string;
  address: string;
  contactName: string;
  managerName: string;
  managerPhone: string;
  /** The send date as printed on the signature line, e.g. "October 16, 2026". */
  sentDate: string;
  supplyMode: WelcomeSupplyMode;
  /** The portal's first-time page ("Set your password"), full URL. */
  portalUrl: string;
  /** The email the portal knows this account by. */
  portalEmail: string;
};

// Same logo as the other customer and sub emails (lib/subPortalInviteEmail.ts).
export const WELCOME_LOGO_URL = "https://cleaning-crm-xi.vercel.app/cw-logo.jpg";

// The app's blues (the same as lib/pdf/account-packet.tsx). Everything else
// is white: blue is only for the header bar, the headings and the button.
export const WELCOME_COLORS = {
  header: "#003b7a",
  bar: "#005bbb",
  accent: "#00a8e8",
  label: "#003b7a",
  text: "#1f2937",
  muted: "#475569",
  border: "#dbeafe",
  tagline: "#dbeafe",
  line: "#94a3b8",
};

export const WELCOME_TITLE = "Welcome to Cleaning World Inc.";
export const WELCOME_TAGLINE = "New Jersey's Most Diversified Cleaning Company";

export type WelcomeRow = { label: string; value: string };

/** "Your Cleaning World Team": the left and right halves of the table. */
export function welcomeTeamRows(data: WelcomePacketData): { left: WelcomeRow[]; right: WelcomeRow[] } {
  return {
    left: [
      { label: "Main Office", value: "201-487-1313" },
      { label: "General Inquiries", value: "info@cleaningworldinc.com" },
      { label: "Account & Services", value: "crm@cleaningworldinc.com" },
      { label: "Website", value: "cleaningworldinc.com" },
    ],
    right: [
      { label: "Headquarters", value: "90 Burlews Ct, Hackensack, NJ 07601" },
      { label: "Office Hours", value: "Mon – Fri, 9:00 AM – 4:30 PM" },
      { label: "Your Account Manager", value: data.managerName },
      { label: "Account Manager Direct", value: data.managerPhone },
    ],
  };
}

/** The "Prepared for" line under the header. Empty parts are left out. */
export function welcomePreparedFor(data: WelcomePacketData): WelcomeRow[] {
  return [
    { label: "Account", value: data.accountName },
    { label: "Address", value: data.address },
    { label: "Contact", value: data.contactName },
  ].filter((row) => row.value.trim());
}

export const WELCOME_VISITS_INTRO =
  "Before your first cleaning, our account management team will conduct two brief on-site visits to ensure your facility is fully assessed and our crew is prepared from day one.";

export const WELCOME_VISITS: { label: string; title: string; text: string; note?: string }[] = [
  {
    label: "Visit 1",
    title: "Site Survey",
    text: "Your account manager will evaluate the full scope of work, document cleaning requirements, collect access details (keys, entry codes, on-site contacts), identify restricted areas, and take reference photos.",
    note: "Please have ready: facility access, a designated on-site contact, and details about restricted areas or alarm systems.",
  },
  {
    label: "Visit 2",
    title: "Team Introduction",
    text: "Your account manager returns with your assigned cleaning crew for a full walkthrough. We will introduce the team, review the cleaning plan, and address any final details — so you feel confident before your first service day.",
  },
  {
    label: "After First Cleaning",
    title: "Follow-Up Call",
    text: "Your account manager will call you after the first cleaning to make sure everything is right.",
  },
];

// The account's supplies setting (supply_account_modes, Supply Control)
// picks the wording. "included" is the packet's original sentence.
const SUPPLY_TEXT: Record<WelcomeSupplyMode, string> = {
  included: "Cleaning World provides all cleaning products and equipment as part of our service, unless otherwise specified in your contract.",
  billed: "Cleaning World provides the cleaning products and equipment for your facility. Supplies are billed to you separately, as agreed in your contract.",
  customer: "Cleaning supplies are provided by your facility and are not included in our service. Please keep them stocked so our team has what it needs on every visit.",
};

export function welcomePolicies(data: WelcomePacketData): { title: string; text: string }[] {
  return [
    {
      title: "Property access",
      text: "Please ensure our team can access your facility on all scheduled days. Coordinate keys, entry codes, or badges with your account manager prior to the site survey.",
    },
    {
      title: "Schedule changes",
      text: "We understand plans change. Please let us know as early as possible and we will do our best to accommodate you at the earliest available time.",
    },
    {
      title: "If something is not right",
      text: "Your complete satisfaction is our priority. Contact us within 24 hours and we will make it right — that is our promise to you.",
    },
    { title: "Supplies & equipment", text: SUPPLY_TEXT[data.supplyMode] ?? SUPPLY_TEXT.included },
    {
      title: "Privacy & professionalism",
      text: "All team members are thoroughly screened and held to the highest professional standards. Your facility and information will always be treated with complete discretion.",
    },
  ];
}

// One line instead of the full list; the link text inside it becomes a link.
export const WELCOME_SERVICES_INTRO =
  "We offer a comprehensive range of professional cleaning services across New Jersey. Ask your account manager about any service, or visit cleaningworldinc.com/services for full details.";
export const WELCOME_SERVICES_LINK_TEXT = "cleaningworldinc.com/services";
export const WELCOME_SERVICES_URL = "https://cleaningworldinc.com/services";

export const WELCOME_PORTAL_TITLE = "Your Customer Portal";
export const WELCOME_PORTAL_INTRO = "See your visits, send requests and reach our team online, any time.";
export const WELCOME_PORTAL_BUTTON = "Open the customer portal";

/** How to log in the first time: the account email, then an emailed link to choose a password. */
export function welcomePortalSteps(data: Pick<WelcomePacketData, "portalEmail">): string {
  const email = data.portalEmail.trim();
  return `Open the portal and enter your account email${email ? `, ${email}` : ""}. We will email you a link to choose your password.`;
}

export const WELCOME_NOTE =
  "At Cleaning World, we don't just clean — we build lasting partnerships. With hundreds of satisfied clients and over 300 five-star reviews across New Jersey, we are proud to be a company you can always count on. We always answer the phone, we always show up, and we will always make it right. Thank you for trusting us with your facility.";

export const WELCOME_FOOTER = [
  "201-487-1313  |  info@cleaningworldinc.com  |  crm@cleaningworldinc.com  |  cleaningworldinc.com",
  "90 Burlews Ct, Hackensack, NJ  |  Park Ridge, NJ  |  Fords, NJ  |  Serving all of New Jersey",
];

export function welcomeSubject(data: Pick<WelcomePacketData, "accountName">): string {
  return `Welcome to Cleaning World — ${data.accountName}`;
}

export function welcomePdfFilename(data: Pick<WelcomePacketData, "accountName">): string {
  const name = data.accountName.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim() || "Account";
  return `${name} - Cleaning World Welcome Packet.pdf`;
}

/* ---------- The email (and the in-app preview) ---------- */

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const C = WELCOME_COLORS;
const FONT = "font-family:Arial,Helvetica,sans-serif;";
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;

function bar(title: string): string {
  return `<div style="background:${C.bar};color:#ffffff;font-size:16px;font-weight:700;padding:10px 16px;margin-top:14px;">${esc(title)}</div>`;
}

function rowsTable(rows: WelcomeRow[]): string {
  return rows
    .map(
      (row) =>
        `<tr>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};background:#ffffff;font-size:13px;font-weight:700;color:${C.label};width:44%;vertical-align:top;">${esc(row.label)}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};background:#ffffff;font-size:13px;color:${C.text};vertical-align:top;">${esc(row.value)}</td>` +
        `</tr>`
    )
    .join("");
}

function link(url: string, text: string): string {
  return `<a href="${esc(url)}" style="color:${C.bar};text-decoration:underline;">${esc(text)}</a>`;
}

/** The packet as an email: a whole HTML page that stays light when the phone is in dark mode. */
export function welcomePacketHtml(data: WelcomePacketData): string {
  const team = welcomeTeamRows(data);
  const prepared = welcomePreparedFor(data);

  const preparedHtml = prepared.length
    ? `<div style="border:1px solid ${C.border};border-top:none;background:#ffffff;padding:12px 16px;font-size:14px;color:${C.text};line-height:1.5;">` +
      `<span style="font-weight:700;color:${C.label};">Prepared for:</span> ` +
      prepared.map((row) => (row.label === "Account" ? `<strong>${esc(row.value)}</strong>` : esc(row.value))).join(" &nbsp;·&nbsp; ") +
      `</div>`
    : "";

  const visits = WELCOME_VISITS.map(
    (visit) =>
      `<tr><td style="padding:0;border-bottom:1px solid ${C.border};background:#ffffff;">` +
      `<div style="padding:12px 14px 0;font-size:14px;font-weight:700;color:${C.label};">${esc(visit.label)} — ${esc(visit.title)}</div>` +
      `<div style="padding:6px 14px 12px;font-size:14px;line-height:1.55;color:${C.text};">${esc(visit.text)}` +
      (visit.note ? `<div style="margin-top:8px;font-style:italic;color:${C.muted};">${esc(visit.note)}</div>` : "") +
      `</div></td></tr>`
  ).join("");

  const policies = welcomePolicies(data)
    .map(
      (policy) =>
        `<tr><td style="padding:10px 16px;border-bottom:1px solid ${C.border};background:#ffffff;font-size:14px;line-height:1.55;color:${C.text};">` +
        `<strong style="color:${C.label};">${esc(policy.title)}:</strong> ${esc(policy.text)}</td></tr>`
    )
    .join("");

  const [servicesBefore, servicesAfter] = WELCOME_SERVICES_INTRO.split(WELCOME_SERVICES_LINK_TEXT);
  const servicesHtml = esc(servicesBefore) + link(WELCOME_SERVICES_URL, WELCOME_SERVICES_LINK_TEXT) + esc(servicesAfter ?? "");

  // A table button: Outlook draws it too.
  const portalButton =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 16px 8px;"><tr>` +
    `<td bgcolor="${C.bar}" style="background:${C.bar};border-radius:8px;">` +
    `<a href="${esc(data.portalUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(WELCOME_PORTAL_BUTTON)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 16px 4px;font-size:12px;color:${C.muted};word-break:break-all;">${link(data.portalUrl, data.portalUrl)}</p>`;

  const body =
    `<div style="background:#ffffff;padding:18px 0;text-align:center;">` +
    `<img src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." width="260" style="width:260px;max-width:80%;height:auto;" />` +
    `</div>` +
    `<div style="background:${C.header};border-bottom:4px solid ${C.accent};padding:16px;">` +
    `<div style="font-size:22px;font-weight:700;color:#ffffff;">${esc(WELCOME_TITLE)}</div>` +
    `<div style="font-size:13px;color:${C.tagline};margin-top:4px;">${esc(WELCOME_TAGLINE)}</div>` +
    `</div>` +
    preparedHtml +
    `<div style="background:#ffffff;padding:0 0 16px;">` +
    bar("Your Cleaning World Team") +
    `<table ${TABLE} style="border-collapse:collapse;border:1px solid ${C.border};border-top:none;">${rowsTable([...team.left, ...team.right])}</table>` +
    bar("Pre-Service Visits") +
    `<p style="margin:10px 16px;font-size:14px;line-height:1.55;color:${C.text};">${esc(WELCOME_VISITS_INTRO)}</p>` +
    `<table ${TABLE} style="border-collapse:collapse;border:1px solid ${C.border};border-bottom:none;">${visits}</table>` +
    bar("Policies & Important Information") +
    `<table ${TABLE} style="border-collapse:collapse;border:1px solid ${C.border};border-top:none;">${policies}</table>` +
    bar("Our Full Range of Services") +
    `<p style="margin:10px 16px;font-size:14px;line-height:1.55;color:${C.text};">${servicesHtml}</p>` +
    bar(WELCOME_PORTAL_TITLE) +
    `<p style="margin:10px 16px 6px;font-size:14px;line-height:1.55;color:${C.text};">${esc(WELCOME_PORTAL_INTRO)} ${esc(welcomePortalSteps(data))}</p>` +
    portalButton +
    bar("A Note From Our Team") +
    `<p style="margin:10px 16px;font-size:14px;line-height:1.6;color:${C.text};">${esc(WELCOME_NOTE)}</p>` +
    `<table ${TABLE} style="margin-top:14px;"><tr>` +
    `<td style="width:50%;padding:0 16px;text-align:center;vertical-align:bottom;">` +
    `<div style="font-size:16px;font-style:italic;color:${C.label};padding-bottom:4px;">${esc(data.managerName)}</div>` +
    `<div style="border-top:1px solid ${C.line};padding-top:6px;font-size:12px;color:${C.muted};">Account Manager Signature</div></td>` +
    `<td style="width:50%;padding:0 16px;text-align:center;vertical-align:bottom;">` +
    `<div style="font-size:15px;color:${C.text};padding-bottom:4px;">${esc(data.sentDate)}</div>` +
    `<div style="border-top:1px solid ${C.line};padding-top:6px;font-size:12px;color:${C.muted};">Date</div></td>` +
    `</tr></table>` +
    `</div>` +
    `<div style="background:#ffffff;border-top:2px solid ${C.accent};color:${C.muted};padding:14px 16px;text-align:center;font-size:12px;line-height:1.7;">` +
    WELCOME_FOOTER.map(esc).join("<br>") +
    `</div>` +
    `<p style="margin:12px 0 0;font-size:12px;color:${C.muted};text-align:center;">The same packet is attached as a PDF.</p>`;

  // "light only" + a white background on every layer: Apple Mail and Outlook
  // keep it light in dark mode, and Gmail has no dark section to flip.
  return (
    `<!DOCTYPE html><html lang="en" style="background:#ffffff;"><head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="color-scheme" content="light only" />` +
    `<meta name="supported-color-schemes" content="light only" />` +
    `<title>${esc(welcomeSubject(data))}</title>` +
    `<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>` +
    `</head>` +
    `<body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff;${FONT}color:${C.text};">` +
    `<table ${TABLE} bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:16px 10px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;"><tr><td style="text-align:left;${FONT}color:${C.text};">` +
    body +
    `</td></tr></table>` +
    `</td></tr></table>` +
    `</body></html>`
  );
}

/** The plain-text twin of the email, for mail apps that do not show HTML. */
export function welcomePacketText(data: WelcomePacketData): string {
  const team = welcomeTeamRows(data);
  const lines: string[] = [WELCOME_TITLE, WELCOME_TAGLINE, ""];
  const prepared = welcomePreparedFor(data);
  if (prepared.length) lines.push(`Prepared for: ${prepared.map((row) => row.value).join(" · ")}`, "");
  lines.push("YOUR CLEANING WORLD TEAM", ...[...team.left, ...team.right].map((row) => `${row.label}: ${row.value}`), "");
  lines.push("PRE-SERVICE VISITS", WELCOME_VISITS_INTRO, "");
  for (const visit of WELCOME_VISITS) lines.push(`${visit.label} — ${visit.title}: ${visit.text}`, ...(visit.note ? [visit.note] : []), "");
  lines.push("POLICIES & IMPORTANT INFORMATION", ...welcomePolicies(data).map((policy) => `${policy.title}: ${policy.text}`), "");
  lines.push("OUR FULL RANGE OF SERVICES", WELCOME_SERVICES_INTRO.replace(WELCOME_SERVICES_LINK_TEXT, WELCOME_SERVICES_URL), "");
  lines.push(WELCOME_PORTAL_TITLE.toUpperCase(), `${WELCOME_PORTAL_INTRO} ${welcomePortalSteps(data)}`, data.portalUrl, "");
  lines.push("A NOTE FROM OUR TEAM", WELCOME_NOTE, "", `${data.managerName}, Account Manager — ${data.sentDate}`, "", ...WELCOME_FOOTER, "", "The same packet is attached as a PDF.");
  return lines.join("\n");
}
