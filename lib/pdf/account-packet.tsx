import fs from "fs";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// Brand colors — matches the CSS custom properties in app/globals.css
// (--cw-blue-dark / --cw-blue-light / --cw-border) so this stays visually
// consistent with the rest of the app even though it no longer shares the
// print stylesheet with AccountPacketPrintView.
const COLORS = {
  blueDark: "#003b7a",
  blueLight: "#00a8e8",
  border: "#dbeafe",
  label: "#64748b",
  value: "#0f172a",
  scopeBg: "#f8fafc",
  scopeBorder: "#e2e8f0",
};

// @react-pdf/renderer's standard-14 fonts are selected by fontFamily name
// directly (not via a separate fontWeight prop) — "Helvetica-Bold" is a
// distinct built-in font, not a style variant of "Helvetica".
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.value,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.blueDark,
    paddingVertical: 22,
    paddingHorizontal: 36,
  },
  logoBox: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logo: {
    width: 120,
    height: "auto",
  },
  headerTitleBlock: {
    alignItems: "flex-end",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    color: "#ffffff",
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: "#ffffff",
    opacity: 0.9,
  },
  headerMeta: {
    marginTop: 8,
    fontSize: 8,
    color: "#ffffff",
    opacity: 0.75,
  },
  accentBar: {
    height: 4,
    backgroundColor: COLORS.blueLight,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 36,
    paddingTop: 26,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: COLORS.blueDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
    marginBottom: 12,
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  field: {
    width: "47%",
    marginBottom: 12,
  },
  fieldLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.label,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  fieldValue: {
    fontSize: 11,
    color: COLORS.value,
  },
  scopeBox: {
    backgroundColor: COLORS.scopeBg,
    borderWidth: 1,
    borderColor: COLORS.scopeBorder,
    borderRadius: 6,
    padding: 12,
  },
  scopeText: {
    fontSize: 10.5,
    lineHeight: 1.5,
    color: COLORS.value,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginHorizontal: 36,
    paddingTop: 12,
    paddingBottom: 26,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  footerCompany: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.label,
  },
  footerLine: {
    fontSize: 8,
    color: COLORS.label,
    marginTop: 1,
  },
  footerNote: {
    fontSize: 8,
    color: COLORS.label,
    textAlign: "right",
  },
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "N/A"}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
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

export function AccountPacketDocument(data: AccountPacketData) {
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
            <Text style={styles.headerMeta}>
              {data.accountName} &middot; Generated {data.generatedDate}
            </Text>
          </View>
        </View>

        <View style={styles.accentBar} />

        <View style={styles.body}>
          <Section title="Account Snapshot">
            <View style={styles.fieldGrid}>
              <Field label="Account Name" value={data.accountName} />
              <Field label="Address" value={data.address} />
              <Field label="Start Date" value={data.startDate} />
              <Field label="Cleaning Schedule" value={data.cleaningSchedule} />
            </View>
          </Section>

          <Section title="Team Leader Assignment">
            <View style={styles.fieldGrid}>
              <Field label="Team Leader Name" value={data.teamLeaderName} />
              <Field label="Monthly Pay" value={data.monthlyPay} />
            </View>
          </Section>

          <Section title="Access">
            <View style={styles.fieldGrid}>
              <Field label="Has Key" value={data.hasKey} />
              <Field label="Alarm Info" value={data.alarmInfo} />
            </View>
          </Section>

          <Section title="Scope of Work">
            <View style={styles.scopeBox}>
              <Text style={styles.scopeText}>{data.scope || "N/A"}</Text>
            </View>
          </Section>
        </View>

        <View style={styles.footer}>
          <View>
            <Text style={styles.footerCompany}>Cleaning World Inc.</Text>
            <Text style={styles.footerLine}>90 Burlews Ct, Hackensack, NJ 07601</Text>
            <Text style={styles.footerLine}>201-487-1313</Text>
          </View>

          <Text style={styles.footerNote}>
            Questions? Contact your manager: {data.manager || "N/A"}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderAccountPacketPdf(data: AccountPacketData): Promise<Buffer> {
  return renderToBuffer(<AccountPacketDocument {...data} />);
}
