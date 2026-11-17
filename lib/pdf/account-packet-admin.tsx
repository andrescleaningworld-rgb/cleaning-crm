import fs from "fs";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";
import { renderScopeFitted } from "@/lib/pdf/fit";

// Deliberately NOT shared with lib/pdf/account-packet.tsx (the Team Leader
// template) — this file is self-contained end to end (styles, components,
// logo loading, the works) even though most of it is identical-looking
// presentational code. The point isn't DRY here: it's that nothing in this
// file can ever be reached from the Team Leader render path, and nothing in
// the Team Leader file can be edited in a way that accidentally changes
// what this one prints. The actual safety boundary is "what data gets
// fetched and passed in" (see app/api/accounts/[id]/pdf/admin/route.ts),
// but keeping the templates fully separate too means a reviewer can look at
// either file in isolation and know it's the whole story. (lib/pdf/fit.ts
// is shared: it only decides one page or two, and carries no account data.)
//
// ONE letter page. Only a scope of work too long for page 1 goes on page 2,
// alone. Nothing smaller than 9 pt. An empty notes box is one short "None"
// line, not a box, to leave room for CONTACTS.
//
// CONTACTS (this admin copy only, never the Team Leader PDF): customer,
// billing (when the account has one), the sub company, the team leader and
// the account manager. Phones and emails are tappable (tel: / mailto:); an
// empty one shows "—" so missing info stands out.

const COLORS = {
  blueDark: "#003b7a",
  blueLight: "#00a8e8",
  border: "#dbeafe",
  label: "#64748b",
  value: "#0f172a",
  boxBg: "#f8fafc",
  boxBorder: "#e2e8f0",
  bannerBg: "#fef2f2",
  bannerBorder: "#fecaca",
  bannerText: "#991b1b",
};

const SIDE = 30;
const TOP = 30;
// Room for the footer, which sits at the bottom of every page.
const BOTTOM = 52;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.value,
    paddingTop: TOP,
    paddingBottom: BOTTOM,
  },
  // Page 1's header runs to the paper's top edge; a page 2 starts at TOP.
  header: {
    marginTop: -TOP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.blueDark,
    paddingVertical: 12,
    paddingHorizontal: SIDE,
  },
  logoBox: { backgroundColor: "#ffffff", borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8 },
  logo: { width: 96, height: "auto" },
  headerTitleBlock: { alignItems: "flex-end", maxWidth: 380 },
  headerTitle: { fontFamily: "Helvetica-Bold", fontSize: 16, color: "#ffffff" },
  headerSubtitle: { marginTop: 1, fontSize: 10, color: "#ffffff", opacity: 0.9 },
  headerAccount: { marginTop: 5, fontFamily: "Helvetica-Bold", fontSize: 12, color: "#ffffff", textAlign: "right" },
  headerMeta: { marginTop: 1, fontSize: 9, color: "#ffffff", opacity: 0.8 },
  accentBar: { height: 3, backgroundColor: COLORS.blueLight },
  banner: {
    backgroundColor: COLORS.bannerBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bannerBorder,
    paddingVertical: 4,
    paddingHorizontal: SIDE,
  },
  bannerText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.bannerText,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  body: { paddingHorizontal: SIDE, paddingTop: 10 },
  section: { marginBottom: 9 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: COLORS.blueDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 3,
    marginBottom: 6,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "25%", paddingRight: 10, marginBottom: 5 },
  cellWide: { width: "50%", paddingRight: 10, marginBottom: 5 },
  label: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.label,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  value: { fontSize: 10.5, color: COLORS.value },
  columns: { flexDirection: "row", justifyContent: "space-between" },
  column: { width: "48.5%" },
  textBox: {
    backgroundColor: COLORS.boxBg,
    borderWidth: 1,
    borderColor: COLORS.boxBorder,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  text: { fontSize: 9.5, lineHeight: 1.4, color: COLORS.value },
  emptyLine: { fontSize: 9.5, color: COLORS.label },
  contactLine: { fontSize: 9.5, lineHeight: 1.35, color: COLORS.value },
  contactLink: { fontSize: 9.5, lineHeight: 1.35, color: COLORS.blueDark, textDecoration: "none" },
  missing: { fontSize: 9.5, lineHeight: 1.35, color: COLORS.label },
  seePage2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: COLORS.blueDark, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 5 },
  page2Title: { fontFamily: "Helvetica-Bold", fontSize: 14, color: COLORS.blueDark },
  page2Account: { fontSize: 10, color: COLORS.label, marginTop: 2, marginBottom: 8 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: SIDE,
    right: SIDE,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  footerCompany: { fontFamily: "Helvetica-Bold", fontSize: 9, color: COLORS.label },
  footerLine: { fontSize: 9, color: COLORS.label, marginTop: 1 },
  footerNote: { fontSize: 9, color: COLORS.label, textAlign: "right", maxWidth: 260 },
});

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={wide ? styles.cellWide : styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "N/A"}</Text>
    </View>
  );
}

// Never split across pages: a section that does not fit moves whole. Only
// the scope (breakable) may run on, so lib/pdf/fit.ts sees that it is too
// long and moves it to page 2.
function Section({ title, breakable = false, children }: { title: string; breakable?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap={breakable}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TextBox({ text, empty = "None", shrinkWhenEmpty = false }: { text: string; empty?: string; shrinkWhenEmpty?: boolean }) {
  // Empty notes: one line, no box (keeps the packet on one page).
  if (!text && shrinkWhenEmpty) return <Text style={styles.emptyLine}>{empty}</Text>;
  return (
    <View style={styles.textBox}>
      <Text style={styles.text}>{text || empty}</Text>
    </View>
  );
}

const DASH = "—";

/** "tel:+12015550123" (a 10-digit number is US); "" when there are no digits. */
function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

const mailHref = (email: string) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? `mailto:${email.trim()}` : "");

/** One line of a contact: plain text, a link, or "—" when empty. */
function ContactLine({ text, href }: { text: string; href?: string }) {
  if (!text) return <Text style={styles.missing}>{DASH}</Text>;
  if (href) {
    return (
      <Link src={href} style={styles.contactLink}>
        {text}
      </Link>
    );
  }
  return <Text style={styles.contactLine}>{text}</Text>;
}

/** One contact column, in the same 4-column grid as the other sections. */
function ContactCell({ label, lines }: { label: string; lines: { text: string; kind?: "phone" | "email" }[] }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      {lines.map((line, index) => (
        <ContactLine key={index} text={line.text} href={line.kind === "phone" ? telHref(line.text) : line.kind === "email" ? mailHref(line.text) : undefined} />
      ))}
    </View>
  );
}

export type AccountPacketAdminData = {
  // Same fields as the Team Leader packet (lib/pdf/account-packet.tsx) —
  // duplicated here as their own type, not imported, for the same
  // full-separation reasoning as the rest of this file.
  accountName: string;
  address: string;
  startDate: string;
  cleaningSchedule: string;
  teamLeaderName: string;
  monthlyPay: string;
  hasKey: string;
  alarmInfo: string;
  /** The account's "Key / Alarm / Access Info". */
  accessInfo: string;
  /** "Notes for Sub" (migration 037), the same text the Team Leader PDF prints. */
  notesForSub: string;
  scope: string;
  manager: string;
  generatedDate: string;

  // Admin-only additions — never present in the Team Leader packet's data
  // type, so there's no shared shape that could accidentally widen what
  // that route passes through.
  accountStatus: string;
  monthlyRevenue: string;
  estGrossMargin: string;
  estGrossMarginPercent: string;
  /** "67%": Monthly Pay as a share of Monthly Revenue (lib/payShare.ts), "—" with no revenue. */
  subPayShare: string;
  /** "33%": what we keep as a share of Monthly Revenue, "—" with no revenue. */
  keepShare: string;
  subcontractorCompany: string;
  notes: string;
  /** CONTACTS: admin copy only. */
  contacts: {
    customer: PacketContact;
    /** null = the account has no Billing contact (the column is left out). */
    billing: PacketContact | null;
    sub: PacketContact & { company: string };
    teamLeader: PacketContact;
    manager: PacketContact;
  };
};

/** A person on the packet's CONTACTS: any part may be "" (shown as "—"). */
export type PacketContact = { name: string; phone: string; email: string };

let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  }
  return cachedLogo;
}

export function AccountPacketAdminDocument({ scopeOnPage2 = false, ...data }: AccountPacketAdminData & { scopeOnPage2?: boolean }) {
  const grossMarginDisplay = `${data.estGrossMargin} (${data.keepShare})`;

  return (
    <Document title={`New Account Packet (Admin) - ${data.accountName}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (renders into a PDF, not the DOM), which has no alt prop */}
            <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
          </View>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>New Account Packet</Text>
            <Text style={styles.headerSubtitle}>Admin / Internal Copy</Text>
            <Text style={styles.headerAccount}>{data.accountName}</Text>
            <Text style={styles.headerMeta}>Generated {data.generatedDate}</Text>
          </View>
        </View>

        <View style={styles.accentBar} />

        <View style={styles.banner}>
          <Text style={styles.bannerText}>Internal use only — contains revenue and margin. Do not share with a subcontractor.</Text>
        </View>

        <View style={styles.body}>
          <Section title="Account Overview">
            <View style={styles.grid}>
              <Field label="Account Status" value={data.accountStatus} />
              <Field label="Sub Company" value={data.subcontractorCompany} />
              <Field label="Monthly Revenue" value={data.monthlyRevenue} />
              <Field label="Est. Gross Margin" value={grossMarginDisplay} />
            </View>
          </Section>

          <Section title="Contacts">
            <View style={styles.grid}>
              <ContactCell
                label="Customer Contact"
                lines={[{ text: data.contacts.customer.name }, { text: data.contacts.customer.phone, kind: "phone" }, { text: data.contacts.customer.email, kind: "email" }]}
              />
              {data.contacts.billing ? (
                <ContactCell
                  label="Billing Contact"
                  lines={[{ text: data.contacts.billing.name }, { text: data.contacts.billing.email, kind: "email" }, { text: data.contacts.billing.phone, kind: "phone" }]}
                />
              ) : null}
              <ContactCell
                label="Sub Company"
                lines={[
                  { text: data.contacts.sub.company },
                  { text: data.contacts.sub.name },
                  { text: data.contacts.sub.phone, kind: "phone" },
                  { text: data.contacts.sub.email, kind: "email" },
                ]}
              />
              <ContactCell label="Team Leader" lines={[{ text: data.contacts.teamLeader.name }, { text: data.contacts.teamLeader.phone, kind: "phone" }]} />
              <ContactCell
                label="Account Manager"
                lines={[{ text: data.contacts.manager.name }, { text: data.contacts.manager.phone, kind: "phone" }, { text: data.contacts.manager.email, kind: "email" }]}
              />
            </View>
          </Section>

          <Section title="Account Snapshot">
            <View style={styles.grid}>
              <Field wide label="Address" value={data.address} />
              <Field label="Start Date" value={data.startDate} />
              <Field label="Cleaning Schedule" value={data.cleaningSchedule} />
            </View>
          </Section>

          <Section title="Team Leader & Access">
            <View style={styles.grid}>
              <Field label="Team Leader Name" value={data.teamLeaderName} />
              <Field label="Monthly Pay" value={`${data.monthlyPay} (${data.subPayShare})`} />
              <Field label="Has Key" value={data.hasKey} />
              <Field label="Alarm Info" value={data.alarmInfo} />
            </View>
          </Section>

          <View style={styles.columns} wrap={false}>
            <View style={styles.column}>
              <Section title="Key / Alarm / Access Info">
                <TextBox text={data.accessInfo} shrinkWhenEmpty />
              </Section>
            </View>
            <View style={styles.column}>
              <Section title="Notes for Sub">
                <TextBox text={data.notesForSub} shrinkWhenEmpty />
              </Section>
            </View>
          </View>

          <Section title="Internal Notes">
            <TextBox text={data.notes} shrinkWhenEmpty />
          </Section>

          {scopeOnPage2 ? (
            <View style={styles.section}>
              <Text style={styles.seePage2}>Scope of work: see page 2</Text>
            </View>
          ) : (
            <Section title="Scope of Work" breakable>
              <TextBox text={data.scope} empty="N/A" />
            </Section>
          )}

          {scopeOnPage2 ? (
            <View break>
              <Text style={styles.page2Title}>Scope of Work</Text>
              <Text style={styles.page2Account}>{data.accountName}</Text>
              <TextBox text={data.scope} empty="N/A" />
            </View>
          ) : null}
        </View>

        <View style={styles.footer} fixed>
          <View>
            <Text style={styles.footerCompany}>Cleaning World Inc.</Text>
            <Text style={styles.footerLine}>90 Burlews Ct, Hackensack, NJ 07601 · 201-487-1313</Text>
          </View>
          <Text style={styles.footerNote}>Questions? Contact your manager: {data.manager || "N/A"}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderAccountPacketAdminPdf(data: AccountPacketAdminData): Promise<Buffer> {
  return renderScopeFitted((scopeOnPage2) => <AccountPacketAdminDocument {...data} scopeOnPage2={scopeOnPage2} />);
}
