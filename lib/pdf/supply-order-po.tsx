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

// Brand colors — matches lib/pdf/account-packet.tsx and the CSS custom
// properties in app/globals.css (--cw-blue-dark/--cw-border) so this stays
// visually consistent with the rest of the app's PDFs.
const COLORS = {
  blueDark: "#003b7a",
  blueLight: "#00a8e8",
  border: "#dbeafe",
  label: "#64748b",
  value: "#0f172a",
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
  accentBar: {
    height: 4,
    backgroundColor: COLORS.blueLight,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 36,
    paddingTop: 20,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 14,
    marginBottom: 16,
  },
  field: {
    width: "47%",
    marginBottom: 12,
  },
  fieldWide: {
    width: "100%",
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
  fieldSubValue: {
    fontSize: 8.5,
    color: COLORS.label,
    marginTop: 1,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#1e293b",
    paddingBottom: 5,
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.label,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.border,
    paddingVertical: 7,
  },
  tableCell: {
    fontSize: 9.5,
    color: COLORS.value,
  },
  itemDescription: {
    fontSize: 8,
    color: COLORS.label,
    marginTop: 2,
  },
  colItem: { width: "40%", paddingRight: 8 },
  colCategory: { width: "20%", paddingRight: 8 },
  colQuantity: { width: "15%", paddingRight: 8 },
  colNotes: { width: "25%" },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginHorizontal: 36,
    paddingTop: 12,
    paddingBottom: 26,
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
});

function Field({
  label,
  value,
  subValue,
  wide,
}: {
  label: string;
  value: string;
  subValue?: string;
  wide?: boolean;
}) {
  return (
    <View style={wide ? styles.fieldWide : styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "N/A"}</Text>
      {subValue ? <Text style={styles.fieldSubValue}>{subValue}</Text> : null}
    </View>
  );
}

export type SupplyOrderPoItem = {
  supplyItem: string;
  description: string;
  category: string;
  quantity: string;
  notes: string;
};

export type SupplyOrderPoData = {
  poNumber: string;
  orderDate: string;
  accountName: string;
  accountId: string;
  subcontractor: string;
  subcontractorEmail: string;
  deliveryMode: string;
  deliveryAddress: string;
  orderIds: string[];
  items: SupplyOrderPoItem[];
  generatedDate: string;
};

// Read once per warm serverless instance rather than on every request, and
// lazily (not at module top-level) so a build-time import of this module can
// never fail on filesystem access — same pattern as lib/pdf/account-packet.tsx.
let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  }
  return cachedLogo;
}

export function SupplyOrderPoDocument(data: SupplyOrderPoData) {
  return (
    <Document title={`Purchase Order ${data.poNumber}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (renders into a PDF, not the DOM), which has no alt prop */}
            <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
          </View>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Purchase Order</Text>
            <Text style={styles.headerSubtitle}>Cleaning World Inc.</Text>
          </View>
        </View>

        <View style={styles.accentBar} />

        <View style={styles.body}>
          <View style={styles.metaGrid}>
            <Field label="PO Number" value={data.poNumber} />
            <Field
              label="Generated"
              value={data.generatedDate}
              subValue={`${data.items.length} item${data.items.length === 1 ? "" : "s"}`}
            />
            <Field label="Order Date" value={data.orderDate} />
            <Field label="Account" value={data.accountName} subValue={data.accountId} />
            <Field
              label="Subcontractor"
              value={data.subcontractor}
              subValue={data.subcontractorEmail}
            />
            <Field label="Delivery Mode" value={data.deliveryMode} />
            <Field label="Delivery Address" value={data.deliveryAddress} wide />
            {data.orderIds.length > 0 ? (
              <Field
                label={`Line Item Order ID${data.orderIds.length === 1 ? "" : "s"}`}
                value={data.orderIds.join(", ")}
                wide
              />
            ) : null}
          </View>

          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.colItem]}>Item</Text>
            <Text style={[styles.tableHeaderCell, styles.colCategory]}>Category</Text>
            <Text style={[styles.tableHeaderCell, styles.colQuantity]}>Quantity</Text>
            <Text style={[styles.tableHeaderCell, styles.colNotes]}>Notes</Text>
          </View>

          {data.items.map((item, index) => (
            <View key={index} style={styles.tableRow} wrap={false}>
              <View style={styles.colItem}>
                <Text style={styles.tableCell}>{item.supplyItem || "-"}</Text>
                {item.description ? (
                  <Text style={styles.itemDescription}>{item.description}</Text>
                ) : null}
              </View>
              <Text style={[styles.tableCell, styles.colCategory]}>{item.category || "-"}</Text>
              <Text style={[styles.tableCell, styles.colQuantity]}>{item.quantity || "-"}</Text>
              <Text style={[styles.tableCell, styles.colNotes]}>{item.notes || "-"}</Text>
            </View>
          ))}

          {data.items.length === 0 ? (
            <Text style={styles.tableCell}>No items on this order.</Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerCompany}>Cleaning World Inc.</Text>
          <Text style={styles.footerLine}>90 Burlews Ct, Hackensack, NJ 07601</Text>
          <Text style={styles.footerLine}>201-487-1313</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderSupplyOrderPoPdf(data: SupplyOrderPoData): Promise<Buffer> {
  return renderToBuffer(<SupplyOrderPoDocument {...data} />);
}
