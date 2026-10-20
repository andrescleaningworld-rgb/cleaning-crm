import fs from "fs";
import path from "path";
import { Document, Page, View, Text, Image, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import {
  WELCOME_COLORS as C,
  WELCOME_FOOTER,
  WELCOME_NOTE,
  WELCOME_PORTAL_BUTTON,
  WELCOME_PORTAL_INTRO,
  WELCOME_PORTAL_TITLE,
  WELCOME_SERVICES_INTRO,
  WELCOME_SERVICES_LINK_TEXT,
  WELCOME_SERVICES_URL,
  WELCOME_TAGLINE,
  WELCOME_TITLE,
  WELCOME_VISITS,
  WELCOME_VISITS_INTRO,
  welcomePolicies,
  welcomePortalSteps,
  welcomePreparedFor,
  welcomeTeamRows,
  type WelcomePacketData,
  type WelcomeRow,
} from "@/lib/welcomePacket";

// The customer Welcome Packet PDF: the same content as the email
// (lib/welcomePacket.ts), laid out like docs/welcome-packet.pdf — page 1 the
// team, visits and policies; page 2 the services line, the portal, the note
// and the signature. White pages; blue only for the header bar and headings.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8.5, color: C.text, backgroundColor: "#ffffff", paddingTop: 30, paddingBottom: 30, paddingHorizontal: 50 },
  logoWrap: { alignItems: "center", marginBottom: 10 },
  logo: { width: 190, height: "auto" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.header, borderBottomWidth: 3, borderColor: C.accent, paddingVertical: 11, paddingHorizontal: 12 },
  headerTitle: { fontFamily: "Helvetica-Bold", fontSize: 14, color: "#ffffff" },
  headerTagline: { fontSize: 8, color: C.tagline },
  prepared: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderTopWidth: 0, borderColor: C.border, paddingVertical: 6, paddingHorizontal: 12 },
  preparedLabel: { fontFamily: "Helvetica-Bold", color: C.label, marginRight: 4 },
  preparedValue: { marginRight: 4 },
  bar: { backgroundColor: C.bar, paddingVertical: 6, paddingHorizontal: 12, marginTop: 6 },
  barText: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#ffffff" },
  teamWrap: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 3 },
  teamTable: { width: "49%", borderWidth: 1, borderColor: C.border, borderBottomWidth: 0 },
  teamRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.border },
  teamLabel: { fontFamily: "Helvetica-Bold", color: C.label, padding: 5, borderRightWidth: 1, borderColor: C.border },
  teamValue: { padding: 5 },
  para: { paddingVertical: 5, paddingHorizontal: 6 },
  visit: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.border },
  visitLabelBox: { width: "22%", padding: 7 },
  visitLabel: { fontFamily: "Helvetica-Bold", color: C.label, marginBottom: 6 },
  visitBody: { width: "78%", padding: 7 },
  visitNote: { fontFamily: "Helvetica-Oblique", marginTop: 6 },
  policies: { borderWidth: 1, borderColor: C.border, borderBottomWidth: 0, marginTop: 3 },
  policy: { borderBottomWidth: 1, borderColor: C.border, paddingVertical: 5, paddingLeft: 18, paddingRight: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  policyTitle: { fontFamily: "Helvetica-Bold", color: C.label },
  link: { color: C.bar, textDecoration: "underline" },
  portalButton: { alignSelf: "flex-start", backgroundColor: C.bar, borderRadius: 5, paddingVertical: 7, paddingHorizontal: 14, marginHorizontal: 6, marginTop: 2, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 9.5, textDecoration: "none" },
  portalUrl: { paddingHorizontal: 6, paddingTop: 4, color: C.muted, fontSize: 7.5 },
  signRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 12 },
  signBox: { width: "36%", alignItems: "center" },
  signValue: { fontFamily: "Helvetica-Oblique", fontSize: 11, color: C.label, marginBottom: 3 },
  signLine: { width: "100%", borderTopWidth: 0.75, borderColor: C.line, marginBottom: 4 },
  signLabel: { color: C.muted },
  footer: { backgroundColor: "#ffffff", borderTopWidth: 1.5, borderColor: C.accent, paddingVertical: 9, alignItems: "center", marginTop: 14 },
  footerLine: { color: C.muted, fontSize: 8, marginVertical: 1.5 },
});

// Read once per warm instance, lazily so a build-time import never touches the disk.
let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  return cachedLogo;
}

function Logo() {
  return (
    <View style={styles.logoWrap}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image (renders into a PDF, not the DOM) has no alt prop */}
      <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
    </View>
  );
}

function Bar({ title }: { title: string }) {
  return (
    <View style={styles.bar} minPresenceAhead={40}>
      <Text style={styles.barText}>{title}</Text>
    </View>
  );
}

function TeamTable({ rows, labelWidth }: { rows: WelcomeRow[]; labelWidth: number }) {
  return (
    <View style={styles.teamTable}>
      {rows.map((row) => (
        <View key={row.label} style={styles.teamRow}>
          <Text style={[styles.teamLabel, { width: `${labelWidth}%` }]}>{row.label}</Text>
          <Text style={[styles.teamValue, { width: `${100 - labelWidth}%` }]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function WelcomePacketDocument(data: WelcomePacketData) {
  const team = welcomeTeamRows(data);
  const prepared = welcomePreparedFor(data);
  const [servicesBefore, servicesAfter = ""] = WELCOME_SERVICES_INTRO.split(WELCOME_SERVICES_LINK_TEXT);
  return (
    <Document title={`Welcome Packet - ${data.accountName}`} author="Cleaning World Inc.">
      <Page size="LETTER" style={styles.page}>
        <Logo />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{WELCOME_TITLE}</Text>
          <Text style={styles.headerTagline}>{WELCOME_TAGLINE}</Text>
        </View>
        {prepared.length ? (
          <View style={styles.prepared}>
            <Text style={styles.preparedLabel}>Prepared for:</Text>
            {prepared.map((row, i) => (
              <Text key={row.label} style={[styles.preparedValue, ...(row.label === "Account" ? [styles.bold] : [])]}>
                {row.value}
                {i < prepared.length - 1 ? "  ·" : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <Bar title="Your Cleaning World Team" />
        <View style={styles.teamWrap}>
          <TeamTable rows={team.left} labelWidth={41} />
          <TeamTable rows={team.right} labelWidth={48} />
        </View>

        <Bar title="Pre-Service Visits" />
        <Text style={styles.para}>{WELCOME_VISITS_INTRO}</Text>
        <View style={{ borderTopWidth: 1, borderColor: C.border }}>
          {WELCOME_VISITS.map((visit) => (
            <View key={visit.label} style={styles.visit} wrap={false}>
              <View style={styles.visitLabelBox}>
                <Text style={styles.visitLabel}>{visit.label}</Text>
                <Text style={styles.visitLabel}>{visit.title}</Text>
              </View>
              <View style={styles.visitBody}>
                <Text>{visit.text}</Text>
                {visit.note ? <Text style={styles.visitNote}>{visit.note}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <Bar title="Policies & Important Information" />
        <View style={styles.policies}>
          {welcomePolicies(data).map((policy) => (
            <Text key={policy.title} style={styles.policy}>
              <Text style={styles.policyTitle}>{policy.title}:</Text> {policy.text}
            </Text>
          ))}
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Logo />
        <Bar title="Our Full Range of Services" />
        <Text style={styles.para}>
          {servicesBefore}
          <Link src={WELCOME_SERVICES_URL} style={styles.link}>
            {WELCOME_SERVICES_LINK_TEXT}
          </Link>
          {servicesAfter}
        </Text>

        <Bar title={WELCOME_PORTAL_TITLE} />
        <Text style={styles.para}>
          {WELCOME_PORTAL_INTRO} {welcomePortalSteps(data)}
        </Text>
        <Link src={data.portalUrl} style={styles.portalButton}>
          {WELCOME_PORTAL_BUTTON}
        </Link>
        <Text style={styles.portalUrl}>{data.portalUrl}</Text>

        <Bar title="A Note From Our Team" />
        <Text style={styles.para}>{WELCOME_NOTE}</Text>

        <View style={styles.signRow} wrap={false}>
          <View style={styles.signBox}>
            <Text style={styles.signValue}>{data.managerName}</Text>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Account Manager Signature</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={[styles.signValue, { fontFamily: "Helvetica", color: C.text }]}>{data.sentDate}</Text>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Date</Text>
          </View>
        </View>

        <View style={styles.footer} wrap={false}>
          {WELCOME_FOOTER.map((line) => (
            <Text key={line} style={styles.footerLine}>
              {line}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function renderWelcomePacketPdf(data: WelcomePacketData): Promise<Buffer> {
  return renderToBuffer(<WelcomePacketDocument {...data} />);
}
