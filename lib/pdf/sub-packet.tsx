import fs from "fs";
import path from "path";
import { Document, Page, View, Text, Image, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { WELCOME_COLORS as C } from "@/lib/welcomePacket";
import { SUB_PACKET_OFFICE, subPacketSections, subPacketSubject, subPacketWords, type SubPacketData, type SubPacketSection } from "@/lib/subPacket";

// The Sub Packet PDF: the same sections as the email (lib/subPacket.ts), in
// the same language, laid out like the customer Welcome Packet PDF. White
// pages; blue only for the header bar and the section bars.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: C.text, backgroundColor: "#ffffff", paddingTop: 24, paddingBottom: 34, paddingHorizontal: 44 },
  logoWrap: { alignItems: "center", marginBottom: 6 },
  logo: { width: 140, height: "auto" },
  header: { backgroundColor: C.header, borderBottomWidth: 3, borderColor: C.accent, paddingVertical: 10, paddingHorizontal: 12 },
  headerTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, color: "#ffffff" },
  headerSub: { fontSize: 9, color: C.tagline, marginTop: 2 },
  hello: { marginTop: 8, marginBottom: 1, fontSize: 10 },
  intro: { marginBottom: 4 },
  bar: { backgroundColor: C.bar, paddingVertical: 4, paddingHorizontal: 10, marginTop: 6 },
  barText: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#ffffff" },
  table: { borderWidth: 1, borderTopWidth: 0, borderColor: C.border },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.border },
  label: { width: "40%", fontFamily: "Helvetica-Bold", color: C.label, paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderColor: C.border },
  value: { width: "60%", paddingVertical: 4, paddingHorizontal: 6 },
  text: { borderWidth: 1, borderTopWidth: 0, borderColor: C.border, paddingVertical: 5, paddingHorizontal: 8 },
  linkBox: { borderWidth: 1, borderTopWidth: 0, borderColor: C.border, paddingVertical: 5, paddingHorizontal: 8 },
  linkLabel: { fontFamily: "Helvetica-Bold", color: C.label },
  linkText: { color: C.muted, marginTop: 1, marginBottom: 3 },
  link: { color: C.bar, textDecoration: "underline" },
  footer: { position: "absolute", bottom: 16, left: 46, right: 46, borderTopWidth: 1.5, borderColor: C.accent, paddingTop: 5, textAlign: "center", fontSize: 7.5, color: C.muted },
});

let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  return cachedLogo;
}

function Section({ section, openMap }: { section: SubPacketSection; openMap: string }) {
  return (
    <View wrap={false}>
      <View style={styles.bar}>
        <Text style={styles.barText}>{section.title}</Text>
      </View>
      {section.kind === "text" ? (
        <Text style={styles.text}>{section.text}</Text>
      ) : section.kind === "links" ? (
        section.links.map((link) => (
          <View key={link.url} style={styles.linkBox}>
            <Text style={styles.linkLabel}>{link.label}</Text>
            <Text style={styles.linkText}>{link.text}</Text>
            <Link src={link.url} style={styles.link}>
              {link.url}
            </Link>
          </View>
        ))
      ) : (
        <View style={styles.table}>
          {section.rows.map((row) => (
            <View key={`${row.label}-${row.value}`} style={styles.row}>
              <Text style={styles.label}>{row.label}</Text>
              <View style={styles.value}>
                <Text>{row.value}</Text>
                {row.href ? (
                  <Link src={row.href} style={styles.link}>
                    {openMap}
                  </Link>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function SubPacketDocument(data: SubPacketData) {
  const words = subPacketWords(data.lang);
  return (
    <Document title={subPacketSubject(data)}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.logoWrap}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image renders into a PDF, not the DOM, and has no alt prop */}
          <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
        </View>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{words.title}</Text>
          <Text style={styles.headerSub}>{data.accountName}</Text>
        </View>
        <Text style={styles.hello}>{words.hello(data.subName || "there")}</Text>
        <Text style={styles.intro}>{words.intro}</Text>
        {subPacketSections(data).map((section) => (
          <Section key={section.title} section={section} openMap={words.openMap} />
        ))}
        <Text style={styles.footer} fixed>
          Cleaning World Inc. · {SUB_PACKET_OFFICE.phone} · {SUB_PACKET_OFFICE.email} · cleaningworldinc.com · {data.sentDate}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderSubPacketPdf(data: SubPacketData): Promise<Buffer> {
  return renderToBuffer(<SubPacketDocument {...data} />);
}
