import fs from "fs";
import path from "path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SupplyOrderDoc } from "@/lib/pg/supply-order-docs";

// The Supply Order PDF (Download on an order, Share selected with only supply
// requests). One order per page: "Cleaning World Inc." with the logo, the title
// "Supply Order", the order date, the account and its delivery address, who
// asked for it, and the items with quantity and unit, plus the crew's "Other
// supplies" line and the note. No prices. Same colors as the cleaning report
// (lib/pdf/porter-checklist-report.tsx).

const COLORS = {
  blueDark: "#003b7a",
  blueLight: "#00a8e8",
  border: "#dbeafe",
  label: "#64748b",
  value: "#0f172a",
  softBg: "#f8fafc",
  softBorder: "#e2e8f0",
};

/** The logo's width on the page. The file is 510 × 95 px, so it stays sharp at this size. */
export const PDF_LOGO_WIDTH = 200;

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 11, color: COLORS.value, paddingBottom: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 28,
    paddingBottom: 16,
    paddingHorizontal: 40,
  },
  logo: { width: PDF_LOGO_WIDTH, height: "auto" },
  company: { alignItems: "flex-end" },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 13, color: COLORS.blueDark },
  companyLine: { fontSize: 9, color: COLORS.label, marginTop: 2 },
  accentBar: { height: 4, backgroundColor: COLORS.blueLight, marginHorizontal: 40 },
  body: { paddingHorizontal: 40, paddingTop: 20 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 24, color: COLORS.blueDark, marginBottom: 16 },
  facts: { flexDirection: "row", flexWrap: "wrap", marginBottom: 18 },
  fact: { width: "50%", marginBottom: 12, paddingRight: 12 },
  factLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: COLORS.label, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  factValue: { fontSize: 12, color: COLORS.value },
  factValueBig: { fontFamily: "Helvetica-Bold", fontSize: 14, color: COLORS.value },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#1e293b", paddingBottom: 5, marginBottom: 2 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9, color: COLORS.label, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: COLORS.border, paddingVertical: 7 },
  colQty: { width: "14%", paddingRight: 8 },
  colUnit: { width: "18%", paddingRight: 8 },
  colItem: { width: "68%" },
  qty: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  cell: { fontSize: 12 },
  box: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: COLORS.softBorder, borderRadius: 6, backgroundColor: COLORS.softBg },
  boxText: { fontSize: 11, lineHeight: 1.4 },
  boxLabel: { fontFamily: "Helvetica-Bold" },
  empty: { fontSize: 11, color: COLORS.label, paddingVertical: 8 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: COLORS.label },
});

let cachedLogo: Buffer | null = null;
function logo(): Buffer {
  if (!cachedLogo) cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  return cachedLogo;
}

function Fact({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={big ? styles.factValueBig : styles.factValue}>{value || "Not on file"}</Text>
    </View>
  );
}

function OrderPage({ doc }: { doc: SupplyOrderDoc }) {
  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image renders into the PDF and has no alt prop */}
        <Image src={{ data: logo(), format: "jpg" }} style={styles.logo} />
        <View style={styles.company}>
          <Text style={styles.companyName}>Cleaning World Inc.</Text>
          <Text style={styles.companyLine}>90 Burlews Ct, Hackensack, NJ 07601</Text>
          <Text style={styles.companyLine}>201-487-1313</Text>
        </View>
      </View>
      <View style={styles.accentBar} />

      <View style={styles.body}>
        <Text style={styles.title}>Supply Order</Text>
        <View style={styles.facts}>
          <Fact label="Account" value={doc.accountName} big />
          <Fact label="Order date" value={doc.date} />
          <Fact label="Delivery address" value={doc.address} />
          <Fact label="Requested by" value={doc.requestedBy} />
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
          <Text style={[styles.th, styles.colUnit]}>Unit</Text>
          <Text style={[styles.th, styles.colItem]}>Item</Text>
        </View>
        {doc.lines.length === 0 && !doc.other ? <Text style={styles.empty}>No items on the list.</Text> : null}
        {doc.lines.map((line, index) => (
          <View key={`${line.item}-${index}`} style={styles.row} wrap={false}>
            <Text style={[styles.qty, styles.colQty]}>{line.qty || "-"}</Text>
            <Text style={[styles.cell, styles.colUnit]}>{line.unit || "-"}</Text>
            <Text style={[styles.cell, styles.colItem]}>{line.item}</Text>
          </View>
        ))}

        {doc.other ? (
          <View style={styles.box} wrap={false}>
            <Text style={styles.boxText}>
              <Text style={styles.boxLabel}>Other supplies: </Text>
              {doc.other}
            </Text>
          </View>
        ) : null}
        {doc.note ? (
          <View style={styles.box} wrap={false}>
            <Text style={styles.boxText}>
              <Text style={styles.boxLabel}>Note: </Text>
              {doc.note}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>Cleaning World Inc. · Supply Order</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "")} />
      </View>
    </Page>
  );
}

export function SupplyOrderDocument({ docs }: { docs: SupplyOrderDoc[] }) {
  const title = docs.length === 1 ? `Supply Order - ${docs[0].accountName}` : `Supply Orders (${docs.length})`;
  return (
    <Document title={title} author="Cleaning World Inc.">
      {docs.map((doc) => (
        <OrderPage key={doc.key} doc={doc} />
      ))}
    </Document>
  );
}

export async function renderSupplyOrderPdf(docs: SupplyOrderDoc[]): Promise<Buffer> {
  return renderToBuffer(<SupplyOrderDocument docs={docs} />);
}
