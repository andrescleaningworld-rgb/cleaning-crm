import fs from "fs";
import path from "path";
import { Document, Page, View, Text, Image, Link, StyleSheet } from "@react-pdf/renderer";
import { renderScopeFitted } from "@/lib/pdf/fit";
import { WELCOME_COLORS as C } from "@/lib/welcomePacket";
import { subPacketOnePage, subPacketSubject, subPacketWords, type SubPacketData, type SubPacketSection } from "@/lib/subPacket";

// The Sub Packet PDF: the same sections as the email (lib/subPacket.ts), in
// the same language, on ONE letter page (subPacketOnePage places them in two
// columns, as the web page at app/sub-packet does). Only a scope of work too
// long for page 1 goes on page 2, alone (lib/pdf/fit.ts decides, by laying
// it out). Nothing smaller than 9 pt. White page; blue only for the header
// bar and the section bars.

const SIDE = 30;
const TOP = 24;
// Room for the footer, which sits at the bottom of every page.
const BOTTOM = 40;

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, color: C.text, backgroundColor: "#ffffff", paddingTop: TOP, paddingBottom: BOTTOM, paddingHorizontal: SIDE },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: C.header, borderBottomWidth: 3, borderColor: C.accent, paddingVertical: 8, paddingHorizontal: 10 },
  logoBox: { backgroundColor: "#ffffff", borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6, marginRight: 12 },
  logo: { width: 92, height: "auto" },
  headerText: { flexGrow: 1, flexShrink: 1 },
  headerTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, color: "#ffffff" },
  headerSub: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.tagline, marginTop: 2 },
  intro: { marginTop: 7, marginBottom: 2, fontSize: 10, lineHeight: 1.35 },
  hello: { fontFamily: "Helvetica-Bold" },
  columns: { flexDirection: "row", justifyContent: "space-between" },
  column: { width: "48.5%" },
  block: { marginTop: 7 },
  bar: { backgroundColor: C.bar, paddingVertical: 3, paddingHorizontal: 8 },
  barText: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#ffffff" },
  table: { borderWidth: 1, borderTopWidth: 0, borderColor: C.border },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.border },
  rowLast: { flexDirection: "row" },
  label: { width: "38%", fontFamily: "Helvetica-Bold", color: C.label, paddingVertical: 3, paddingHorizontal: 5, borderRightWidth: 1, borderColor: C.border },
  value: { width: "62%", paddingVertical: 3, paddingHorizontal: 5 },
  text: { fontSize: 9.5, lineHeight: 1.35, borderWidth: 1, borderTopWidth: 0, borderColor: C.border, paddingVertical: 4, paddingHorizontal: 7 },
  linkBox: { borderWidth: 1, borderTopWidth: 0, borderColor: C.border, paddingVertical: 4, paddingHorizontal: 7 },
  linkLabel: { fontFamily: "Helvetica-Bold", color: C.label },
  linkText: { color: C.muted, marginTop: 1, marginBottom: 1 },
  link: { color: C.bar, textDecoration: "underline" },
  seePage2: { marginTop: 7, fontFamily: "Helvetica-Bold", fontSize: 10.5, color: C.bar, borderTopWidth: 1.5, borderColor: C.accent, paddingTop: 4 },
  page2Account: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.text, marginBottom: 6 },
  footer: { position: "absolute", bottom: 14, left: SIDE, right: SIDE, borderTopWidth: 1.5, borderColor: C.accent, paddingTop: 4, textAlign: "center", fontSize: 9, color: C.muted },
});

let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  return cachedLogo;
}

// Words move whole to the next line, never split with a hyphen ("man-ager").
const wholeWords = (word: string) => [word];

function Bar({ title }: { title: string }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.barText}>{title}</Text>
    </View>
  );
}

// Never split across pages: a section that does not fit moves whole. Only
// the scope (breakable) may run on, so lib/pdf/fit.ts sees that it is too
// long and moves it to page 2.
function Section({ section, openMap, breakable = false }: { section: SubPacketSection; openMap: string; breakable?: boolean }) {
  return (
    <View style={styles.block} wrap={breakable}>
      <Bar title={section.title} />
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
          {section.rows.map((row, index) => (
            <View key={`${row.label}-${row.value}`} style={index === section.rows.length - 1 ? styles.rowLast : styles.row}>
              <Text style={styles.label} hyphenationCallback={wholeWords}>
                {row.label}
              </Text>
              <View style={styles.value}>
                <Text hyphenationCallback={wholeWords}>{row.value}</Text>
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

function SubPacketDocument({ scopeOnPage2, ...data }: SubPacketData & { scopeOnPage2: boolean }) {
  const words = subPacketWords(data.lang);
  const layout = subPacketOnePage(data);
  return (
    <Document title={subPacketSubject(data)}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image renders into a PDF, not the DOM, and has no alt prop */}
            <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{words.title}</Text>
            <Text style={styles.headerSub}>{data.accountName}</Text>
          </View>
        </View>
        <Text style={styles.intro}>
          <Text style={styles.hello}>{words.hello(data.subName || "there")} </Text>
          {words.intro}
        </Text>

        <View style={styles.columns}>
          <View style={styles.column}>
            {layout.left.map((section) => (
              <Section key={section.id} section={section} openMap={words.openMap} />
            ))}
          </View>
          <View style={styles.column}>
            {layout.right.map((section) => (
              <Section key={section.id} section={section} openMap={words.openMap} />
            ))}
          </View>
        </View>

        {layout.boxes.length ? (
          <View style={styles.columns} wrap={false}>
            {layout.boxes.map((section) => (
              <View key={section.id} style={layout.boxes.length > 1 ? styles.column : { width: "100%" }}>
                <Section section={section} openMap={words.openMap} />
              </View>
            ))}
          </View>
        ) : null}

        {layout.scope ? (
          scopeOnPage2 ? (
            <>
              <Text style={styles.seePage2}>
                {words.scope}: {words.seePage2}
              </Text>
              <View break>
                <Text style={styles.page2Account}>{data.accountName}</Text>
                <Bar title={layout.scope.title} />
                <Text style={styles.text}>{layout.scope.kind === "text" ? layout.scope.text : ""}</Text>
              </View>
            </>
          ) : (
            <Section section={layout.scope} openMap={words.openMap} breakable />
          )
        ) : null}

        <Text style={styles.footer} fixed>
          Cleaning World Inc. · cleaningworldinc.com · {data.sentDate}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderSubPacketPdf(data: SubPacketData): Promise<Buffer> {
  return renderScopeFitted((scopeOnPage2) => <SubPacketDocument {...data} scopeOnPage2={scopeOnPage2} />);
}
