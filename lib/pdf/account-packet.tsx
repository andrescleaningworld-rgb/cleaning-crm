import fs from "fs";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { renderScopeFitted } from "@/lib/pdf/fit";

// The Team Leader packet: ONE letter page. Only a scope of work too long for
// page 1 goes on page 2, alone (lib/pdf/fit.ts decides, by laying it out).
// Nothing smaller than 9 pt. The account's internal notes, revenue and
// margin are never in it: the route passes only the fields below.

// Brand colors — matches the CSS custom properties in app/globals.css
// (--cw-blue-dark / --cw-blue-light / --cw-border).
const COLORS = {
  blueDark: "#003b7a",
  blueLight: "#00a8e8",
  border: "#dbeafe",
  label: "#64748b",
  value: "#0f172a",
  boxBg: "#f8fafc",
  boxBorder: "#e2e8f0",
};

// @react-pdf/renderer's standard-14 fonts are selected by fontFamily name
// directly: "Helvetica-Bold" is its own font, not a weight of "Helvetica".
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
  body: { paddingHorizontal: SIDE, paddingTop: 12 },
  section: { marginBottom: 10 },
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
  cell: { width: "25%", paddingRight: 10, marginBottom: 6 },
  cellWide: { width: "50%", paddingRight: 10, marginBottom: 6 },
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

function TextBox({ text, empty = "None" }: { text: string; empty?: string }) {
  return (
    <View style={styles.textBox}>
      <Text style={styles.text}>{text || empty}</Text>
    </View>
  );
}

export type AccountPacketData = {
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
  /** "Notes for Sub" (migration 037). The account's internal notes are never in this PDF. */
  notesForSub: string;
  scope: string;
  manager: string;
  generatedDate: string;
};

// Read once per warm serverless instance rather than on every request, and
// lazily (not at module top-level) so a build-time import of this module can
// never fail on filesystem access.
let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  }
  return cachedLogo;
}

export function AccountPacketDocument({ scopeOnPage2 = false, ...data }: AccountPacketData & { scopeOnPage2?: boolean }) {
  return (
    <Document title={`New Account Packet - ${data.accountName}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (renders into a PDF, not the DOM), which has no alt prop */}
            <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
          </View>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>New Account Packet</Text>
            <Text style={styles.headerSubtitle}>Prepared for Your Team Leader</Text>
            <Text style={styles.headerAccount}>{data.accountName}</Text>
            <Text style={styles.headerMeta}>Generated {data.generatedDate}</Text>
          </View>
        </View>

        <View style={styles.accentBar} />

        <View style={styles.body}>
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
              <Field label="Monthly Pay" value={data.monthlyPay} />
              <Field label="Has Key" value={data.hasKey} />
              <Field label="Alarm Info" value={data.alarmInfo} />
            </View>
          </Section>

          <View style={styles.columns} wrap={false}>
            <View style={styles.column}>
              <Section title="Access Info">
                <TextBox text={data.accessInfo} />
              </Section>
            </View>
            <View style={styles.column}>
              <Section title="Notes for Sub">
                <TextBox text={data.notesForSub} />
              </Section>
            </View>
          </View>

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

export async function renderAccountPacketPdf(data: AccountPacketData): Promise<Buffer> {
  return renderScopeFitted((scopeOnPage2) => <AccountPacketDocument {...data} scopeOnPage2={scopeOnPage2} />);
}
