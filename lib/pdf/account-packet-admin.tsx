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

// Deliberately NOT shared with lib/pdf/account-packet.tsx (the Team Leader
// template) — this file is self-contained end to end (styles, components,
// logo loading, the works) even though most of it is identical-looking
// presentational code. The point isn't DRY here: it's that nothing in this
// file can ever be reached from the Team Leader render path, and nothing in
// the Team Leader file can be edited in a way that accidentally changes
// what this one prints. The actual safety boundary is "what data gets
// fetched and passed in" (see app/api/accounts/[id]/pdf/admin/route.ts),
// but keeping the templates fully separate too means a reviewer can look at
// either file in isolation and know it's the whole story.

const COLORS = {
  blueDark: "#003b7a",
  blueLight: "#00a8e8",
  border: "#dbeafe",
  label: "#64748b",
  value: "#0f172a",
  scopeBg: "#f8fafc",
  scopeBorder: "#e2e8f0",
  bannerBg: "#fef2f2",
  bannerBorder: "#fecaca",
  bannerText: "#991b1b",
};

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
    paddingVertical: 16,
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
  banner: {
    backgroundColor: COLORS.bannerBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bannerBorder,
    paddingVertical: 6,
    paddingHorizontal: 36,
  },
  bannerText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: COLORS.bannerText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  // No flexGrow here (unlike the Team Leader template) — with the extra
  // banner + two extra sections this variant carries, forcing the footer to
  // the literal bottom of the page via flexGrow was tipping react-pdf's
  // (conservative) pagination height estimate just over one page and
  // producing a trailing blank second page even though the final compacted
  // layout visibly fits with room to spare. A naturally-flowing footer
  // right after Notes reads fine and, combined with the tighter spacing
  // below, keeps this comfortably on one page.
  body: {
    paddingHorizontal: 36,
    paddingTop: 14,
  },
  section: {
    marginBottom: 12,
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
  textBox: {
    backgroundColor: COLORS.scopeBg,
    borderWidth: 1,
    borderColor: COLORS.scopeBorder,
    borderRadius: 6,
    padding: 12,
  },
  textBoxText: {
    fontSize: 10.5,
    lineHeight: 1.5,
    color: COLORS.value,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginHorizontal: 36,
    marginTop: 4,
    paddingTop: 10,
    paddingBottom: 16,
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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
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
  subcontractorCompany: string;
  notes: string;
};

let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  }
  return cachedLogo;
}

export function AccountPacketAdminDocument(data: AccountPacketAdminData) {
  const grossMarginDisplay = data.estGrossMarginPercent
    ? `${data.estGrossMargin} (${data.estGrossMarginPercent}%)`
    : data.estGrossMargin;

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
            <Text style={styles.headerMeta}>
              {data.accountName} &middot; Generated {data.generatedDate}
            </Text>
          </View>
        </View>

        <View style={styles.accentBar} />

        <View style={styles.banner}>
          <Text style={styles.bannerText}>Internal use only — contains revenue and margin. Do not share with a subcontractor.</Text>
        </View>

        <View style={styles.body}>
          <Section title="Account Overview">
            <View style={styles.fieldGrid}>
              <Field label="Account Status" value={data.accountStatus} />
              <Field label="Subcontractor Company" value={data.subcontractorCompany} />
              <Field label="Monthly Revenue" value={data.monthlyRevenue} />
              <Field label="Est. Gross Margin" value={grossMarginDisplay} />
            </View>
          </Section>

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
            <View style={styles.textBox}>
              <Text style={styles.textBoxText}>{data.scope || "N/A"}</Text>
            </View>
          </Section>

          <Section title="Notes">
            <View style={styles.textBox}>
              <Text style={styles.textBoxText}>{data.notes || "N/A"}</Text>
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

export async function renderAccountPacketAdminPdf(data: AccountPacketAdminData): Promise<Buffer> {
  return renderToBuffer(<AccountPacketAdminDocument {...data} />);
}
