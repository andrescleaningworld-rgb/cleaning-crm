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
};

// Same logo as the other customer and sub emails (lib/subPortalInviteEmail.ts).
export const WELCOME_LOGO_URL = "https://cleaning-crm-xi.vercel.app/cw-logo.jpg";

export const WELCOME_COLORS = {
  header: "#0c3c78",
  bar: "#1b5ea6",
  label: "#174a86",
  text: "#1f2937",
  muted: "#475569",
  rowAlt: "#f3f7fc",
  visitBg: "#e6f0fb",
  border: "#c6dbf1",
  tagline: "#cfe0f5",
  footer: "#06294f",
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

export const WELCOME_SERVICES_INTRO =
  "We offer a comprehensive range of professional cleaning services across New Jersey. Ask your account manager about any service, or visit cleaningworldinc.com/services for full details.";

export const WELCOME_SERVICES: { title: string; subtitle: string; items: string[] }[] = [
  {
    title: "Commercial Cleaning",
    subtitle: "Offices, retail, restaurants, corporate & supermarkets",
    items: ["Commercial & Office Cleaning", "Janitorial Services", "Commercial Carpet Cleaning", "Floor Care & Waxing", "Tile & Grout Cleaning", "Kitchen Cleaning", "Window Cleaning", "Post-Construction Cleaning", "Junk Removal & Hauling"],
  },
  {
    title: "Industrial Cleaning",
    subtitle: "Warehouses, auto dealerships & manufacturing facilities",
    items: ["Industrial Cleaning & Floor Care", "Warehouse Cleaning", "Concrete Floor Cleaning & Polishing", "Parking Garage Cleaning", "Post-Construction Cleanup", "High Dusting / Rafter Cleaning", "Graffiti Removal", "Exterior Building Cleaning", "Power Washing"],
  },
  {
    title: "Residential Cleaning",
    subtitle: "Homes, condos, apartments & estate properties",
    items: ["Heavy Duty Deep Cleaning", "Move-In / Move-Out Cleaning", "Hoarder Cleanup", "Carpet Cleaning", "Wood Floor Cleaning & Refinishing", "Floor Waxing", "Post-Construction Cleaning", "Junk Removal", "Estate Cleanouts & Disinfecting"],
  },
  {
    title: "Floor Care",
    subtitle: "All floor types — commercial, industrial & residential",
    items: ["Floor Cleaning & Strip/Wax", "Tile & Grout Cleaning", "Carpet Cleaning", "Hardwood Floor Cleaning", "Hardwood Floor Refinishing", "Wood Floor Sanding", "Concrete Floor Cleaning & Polishing"],
  },
  {
    title: "Exterior & Power Washing",
    subtitle: "Residential, commercial & industrial exteriors",
    items: ["General Power Washing", "House Soft Wash", "Roof Cleaning", "Exterior Building Cleaning", "Paver & Walkway Washing", "Deck & Fence Power Wash", "Graffiti Removal", "Vehicle & Equipment Washing", "Parking Garage Cleaning"],
  },
  {
    title: "Specialty Services",
    subtitle: "Medical, schools, law firms, gyms & government",
    items: ["Medical Office Cleaning", "Event Cleaning", "Office & Home Disinfecting", "Hoarding Cleanup", "Pet Stain & Odor Removal", "Furniture Pickup", "Estate Cleanouts", "Flood Cleanup", "Street Sweeping & Window Care"],
  },
];

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

function bar(title: string): string {
  return `<div style="background:${C.bar};color:#ffffff;font-size:16px;font-weight:700;padding:10px 16px;margin-top:14px;">${esc(title)}</div>`;
}

function rowsTable(rows: WelcomeRow[], startIndex = 0): string {
  return rows
    .map(
      (row, i) =>
        `<tr style="background:${(i + startIndex) % 2 ? C.rowAlt : "#ffffff"};">` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.label};width:44%;vertical-align:top;">${esc(row.label)}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};font-size:13px;color:${C.text};vertical-align:top;">${esc(row.value)}</td>` +
        `</tr>`
    )
    .join("");
}

/** The packet as an email body: one column on a phone, the same blocks as the PDF. */
export function welcomePacketHtml(data: WelcomePacketData): string {
  const team = welcomeTeamRows(data);
  const prepared = welcomePreparedFor(data);

  const preparedHtml = prepared.length
    ? `<div style="border:1px solid ${C.border};border-top:none;background:${C.rowAlt};padding:12px 16px;font-size:14px;color:${C.text};line-height:1.5;">` +
      `<span style="font-weight:700;color:${C.label};">Prepared for:</span> ` +
      prepared.map((row) => (row.label === "Account" ? `<strong>${esc(row.value)}</strong>` : esc(row.value))).join(" &nbsp;·&nbsp; ") +
      `</div>`
    : "";

  const visits = WELCOME_VISITS.map(
    (visit, i) =>
      `<tr><td style="padding:0;border-bottom:1px solid ${C.border};">` +
      `<div style="background:${i === 0 ? C.visitBg : C.rowAlt};padding:12px 14px;font-size:14px;font-weight:700;color:${C.label};">${esc(visit.label)} — ${esc(visit.title)}</div>` +
      `<div style="padding:10px 14px 12px;font-size:14px;line-height:1.55;color:${C.text};">${esc(visit.text)}` +
      (visit.note ? `<div style="margin-top:8px;font-style:italic;color:${C.muted};">${esc(visit.note)}</div>` : "") +
      `</div></td></tr>`
  ).join("");

  const policies = welcomePolicies(data)
    .map(
      (policy, i) =>
        `<tr><td style="padding:10px 16px;border-bottom:1px solid ${C.border};background:${i % 2 ? C.rowAlt : "#ffffff"};font-size:14px;line-height:1.55;color:${C.text};">` +
        `<strong>${esc(policy.title)}:</strong> ${esc(policy.text)}</td></tr>`
    )
    .join("");

  // Two boxes side by side on a wide screen; they wrap to one per line on a phone.
  const services = WELCOME_SERVICES.map(
    (group) =>
      `<div style="display:inline-block;vertical-align:top;width:100%;max-width:292px;margin:6px 4px;border:1px solid ${C.border};text-align:left;">` +
      `<div style="background:${C.visitBg};padding:9px 12px;border-bottom:1px solid ${C.border};">` +
      `<div style="font-size:14px;font-weight:700;color:${C.label};">${esc(group.title)}</div>` +
      `<div style="font-size:12px;font-style:italic;color:${C.bar};margin-top:2px;">${esc(group.subtitle)}</div></div>` +
      `<div style="padding:8px 12px;font-size:13px;line-height:1.7;color:${C.text};">${group.items.map((item) => `• ${esc(item)}`).join("<br>")}</div>` +
      `</div>`
  ).join("");

  return (
    `<div style="margin:0;padding:0;background:#eef2f7;${FONT}color:${C.text};">` +
    `<div style="max-width:640px;margin:0 auto;padding:16px 10px;">` +
    `<div style="background:#ffffff;padding:18px 0;text-align:center;">` +
    `<img src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." width="260" style="width:260px;max-width:80%;height:auto;" />` +
    `</div>` +
    `<div style="background:${C.header};padding:16px;">` +
    `<div style="font-size:22px;font-weight:700;color:#ffffff;">${esc(WELCOME_TITLE)}</div>` +
    `<div style="font-size:13px;color:${C.tagline};margin-top:4px;">${esc(WELCOME_TAGLINE)}</div>` +
    `</div>` +
    preparedHtml +
    `<div style="background:#ffffff;padding:0 0 16px;">` +
    bar("Your Cleaning World Team") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.border};border-top:none;">${rowsTable([...team.left, ...team.right])}</table>` +
    bar("Pre-Service Visits") +
    `<p style="margin:10px 16px;font-size:14px;line-height:1.55;">${esc(WELCOME_VISITS_INTRO)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.border};border-bottom:none;">${visits}</table>` +
    bar("Policies & Important Information") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.border};border-top:none;">${policies}</table>` +
    bar("Our Full Range of Services") +
    `<p style="margin:10px 16px;font-size:14px;line-height:1.55;">${esc(WELCOME_SERVICES_INTRO)}</p>` +
    `<div style="text-align:center;font-size:0;">${services}</div>` +
    bar("A Note From Our Team") +
    `<p style="margin:10px 16px;font-size:14px;line-height:1.6;">${esc(WELCOME_NOTE)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>` +
    `<td style="width:50%;padding:0 16px;text-align:center;vertical-align:bottom;">` +
    `<div style="font-size:16px;font-style:italic;color:${C.label};padding-bottom:4px;">${esc(data.managerName)}</div>` +
    `<div style="border-top:1px solid #94a3b8;padding-top:6px;font-size:12px;color:${C.muted};">Account Manager Signature</div></td>` +
    `<td style="width:50%;padding:0 16px;text-align:center;vertical-align:bottom;">` +
    `<div style="font-size:15px;color:${C.text};padding-bottom:4px;">${esc(data.sentDate)}</div>` +
    `<div style="border-top:1px solid #94a3b8;padding-top:6px;font-size:12px;color:${C.muted};">Date</div></td>` +
    `</tr></table>` +
    `</div>` +
    `<div style="background:${C.footer};color:#ffffff;padding:14px 16px;text-align:center;font-size:12px;line-height:1.7;">` +
    WELCOME_FOOTER.map(esc).join("<br>") +
    `</div>` +
    `<p style="margin:12px 0 0;font-size:12px;color:${C.muted};text-align:center;">The same packet is attached as a PDF.</p>` +
    `</div></div>`
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
  lines.push("OUR FULL RANGE OF SERVICES", WELCOME_SERVICES_INTRO, "");
  for (const group of WELCOME_SERVICES) lines.push(`${group.title} (${group.subtitle})`, ...group.items.map((item) => `  • ${item}`), "");
  lines.push("A NOTE FROM OUR TEAM", WELCOME_NOTE, "", `${data.managerName}, Account Manager — ${data.sentDate}`, "", ...WELCOME_FOOTER, "", "The same packet is attached as a PDF.");
  return lines.join("\n");
}
