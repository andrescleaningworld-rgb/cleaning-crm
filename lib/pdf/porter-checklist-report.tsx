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
import { describeWorkTimes, type ChecklistSubmissionSection } from "@/lib/checklistTemplate";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import { TEAM_HUB_TIMEZONE } from "@/lib/teamHubTimezone";

// Self-contained, mirroring lib/pdf/account-packet-admin.tsx's styling
// conventions — but this is the customer-facing variant (like
// lib/pdf/account-packet.tsx), so there is deliberately no internal-only
// banner and nothing here should ever describe revenue/margin/internal data.

const COLORS = {
  blueDark: "#003b7a",
  blueLight: "#00a8e8",
  border: "#dbeafe",
  label: "#64748b",
  value: "#0f172a",
  greenBg: "#dcfce7",
  greenText: "#166534",
  amberBg: "#fef3c7",
  amberText: "#92400e",
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
    width: 110,
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
    paddingHorizontal: 36,
    paddingTop: 16,
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
    marginBottom: 10,
  },
  summarySection: {
    marginBottom: 16,
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
    paddingVertical: 6,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.value,
  },
  colDate: { width: "16%", paddingRight: 8 },
  colTab: { width: "16%", paddingRight: 8 },
  colPorter: { width: "20%", paddingRight: 8 },
  colCompletion: { width: "14%", paddingRight: 8 },
  colNotes: { width: "34%" },
  truncationNote: {
    marginTop: 8,
    fontSize: 8,
    color: COLORS.label,
    fontStyle: "italic",
  },
  detailIntro: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: COLORS.blueDark,
    marginBottom: 10,
  },
  submissionBlock: {
    marginBottom: 16,
  },
  submissionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  submissionHeaderTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: COLORS.value,
  },
  submissionHeaderMeta: {
    fontSize: 8,
    color: COLORS.label,
    marginTop: 1,
  },
  completionBadge: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  generalNotesBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  generalNotesText: {
    fontSize: 9,
    lineHeight: 1.4,
    color: COLORS.value,
  },
  checklistSection: {
    marginBottom: 8,
  },
  checklistSectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: COLORS.blueDark,
    marginBottom: 4,
  },
  checklistItemRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  checklistMark: {
    width: 14,
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
  },
  supplyQty: {
    width: 30,
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
  },
  checklistItemText: {
    flex: 1,
  },
  checklistItemLabel: {
    fontSize: 9.5,
    color: COLORS.value,
  },
  checklistItemSubNote: {
    fontSize: 8,
    color: COLORS.label,
    marginTop: 1,
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

export type PorterChecklistReportSubmission = {
  id: number;
  submittedAt: string;
  // Crew Link tab the submission came from (null for unlinked old rows).
  tabName: string | null;
  porterName: string;
  timeIn: string;
  timeOut: string;
  // Automatic start time (Crew Link redesign); null on older submissions,
  // which show their typed Time In / Time Out instead.
  startedAt: string | null;
  completedCount: number;
  totalCount: number;
  generalNotes: string;
  sections: ChecklistSubmissionSection[];
};

export type PorterChecklistReportData = {
  accountName: string;
  address: string;
  periodLabel: string;
  generatedDate: string;
  // Both newest first; the report shows checklists, then supply requests.
  submissions: PorterChecklistReportSubmission[];
  supplyRequests: SelectedSupplyRequest[];
  truncated: boolean;
};

let cachedLogo: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (!cachedLogo) {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  }
  return cachedLogo;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Eastern, not the server's UTC — a late-evening visit must not print as the next day.
  return date.toLocaleDateString("en-US", { timeZone: TEAM_HUB_TIMEZONE, month: "short", day: "numeric", year: "numeric" });
}

function CompletionBadge({ completed, total }: { completed: number; total: number }) {
  const full = completed === total && total > 0;
  return (
    <Text
      style={[
        styles.completionBadge,
        { backgroundColor: full ? COLORS.greenBg : COLORS.amberBg, color: full ? COLORS.greenText : COLORS.amberText },
      ]}
    >
      {completed}/{total}
    </Text>
  );
}

export function PorterChecklistReportDocument(data: PorterChecklistReportData) {
  return (
    <Document title={`Cleaning Report - ${data.accountName}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (renders into a PDF, not the DOM), which has no alt prop */}
            <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
          </View>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Cleaning Report</Text>
            <Text style={styles.headerSubtitle}>{data.accountName}</Text>
            <Text style={styles.headerMeta}>
              {data.address ? `${data.address} · ` : ""}
              {data.periodLabel} &middot; Generated {data.generatedDate}
            </Text>
          </View>
        </View>

        <View style={styles.accentBar} />

        <View style={styles.body}>
          {data.submissions.length > 0 ? (
          <>
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>Checklist summary</Text>

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.colDate]}>Date</Text>
              <Text style={[styles.tableHeaderCell, styles.colTab]}>Checklist</Text>
              <Text style={[styles.tableHeaderCell, styles.colPorter]}>Crew member</Text>
              <Text style={[styles.tableHeaderCell, styles.colCompletion]}>Completion</Text>
              <Text style={[styles.tableHeaderCell, styles.colNotes]}>Notes</Text>
            </View>

            {data.submissions.map((submission) => (
              <View key={submission.id} style={styles.tableRow} wrap={false}>
                <Text style={[styles.tableCell, styles.colDate]}>{formatDate(submission.submittedAt)}</Text>
                <Text style={[styles.tableCell, styles.colTab]}>{submission.tabName || "-"}</Text>
                <Text style={[styles.tableCell, styles.colPorter]}>{submission.porterName || "-"}</Text>
                <Text style={[styles.tableCell, styles.colCompletion]}>
                  {submission.completedCount}/{submission.totalCount}
                </Text>
                <Text style={[styles.tableCell, styles.colNotes]}>{submission.generalNotes || "-"}</Text>
              </View>
            ))}

            {data.truncated ? (
              <Text style={styles.truncationNote}>
                Showing the first {data.submissions.length} submissions in this period.
              </Text>
            ) : null}
          </View>

          <Text style={styles.detailIntro} break>
            Checklists
          </Text>

          {data.submissions.map((submission) => (
            <ChecklistBlock key={submission.id} submission={submission} />
          ))}
          </>
          ) : null}

          {data.supplyRequests.length > 0 ? (
            <View break={data.submissions.length > 0}>
              <Text style={styles.detailIntro}>Supply requests</Text>
              {data.supplyRequests.map((request) => (
                <SupplyBlock key={request.id} request={request} />
              ))}
            </View>
          ) : null}
        </View>

        <ReportFooter />
      </Page>
    </Document>
  );
}

function ReportFooter() {
  return (
    <View style={styles.footer}>
      <View>
        <Text style={styles.footerCompany}>Cleaning World Inc.</Text>
        <Text style={styles.footerLine}>90 Burlews Ct, Hackensack, NJ 07601</Text>
        <Text style={styles.footerLine}>201-487-1313</Text>
      </View>
      <Text style={styles.footerNote}>Thank you for choosing Cleaning World.</Text>
    </View>
  );
}

function ChecklistBlock({ submission }: { submission: PorterChecklistReportSubmission }) {
  return (
    <View style={styles.submissionBlock} wrap={false}>
      <View style={styles.submissionHeaderRow}>
        <View>
          <Text style={styles.submissionHeaderTitle}>
            {formatCrewDateTime(submission.submittedAt)}
            {submission.tabName ? ` · ${submission.tabName}` : ""}
          </Text>
          <Text style={styles.submissionHeaderMeta}>
            {(() => {
              const times = describeWorkTimes(submission);
              return `${submission.porterName || "Unknown porter"} · ${times.startLabel} ${times.start} · ${times.endLabel} ${times.end}`;
            })()}
          </Text>
        </View>
        <CompletionBadge completed={submission.completedCount} total={submission.totalCount} />
      </View>

      {submission.generalNotes ? (
        <View style={styles.generalNotesBox}>
          <Text style={styles.generalNotesText}>{submission.generalNotes}</Text>
        </View>
      ) : null}

      {submission.sections.map((section) => (
        <View key={section.key} style={styles.checklistSection}>
          <Text style={styles.checklistSectionTitle}>{section.title}</Text>
          {section.items.map((item) => (
            <View key={item.key} style={styles.checklistItemRow}>
              <Text style={styles.checklistMark}>{item.checked ? "✓" : "○"}</Text>
              <View style={styles.checklistItemText}>
                <Text style={styles.checklistItemLabel}>{item.label}</Text>
                {item.subNote ? <Text style={styles.checklistItemSubNote}>{item.subNote}</Text> : null}
                {item.note ? <Text style={styles.checklistItemSubNote}>Note: {item.note}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// A Crew Link supply request in the "Share selected" report: who asked,
// when, and what they asked for. No prices or costs.
export type SelectedSupplyRequest = {
  id: number;
  createdAt: string;
  reporterName: string;
  status: string;
  note: string;
  otherItems: string | null;
  lines: { itemName: string; unit: string; qty: number }[];
};

function SupplyBlock({ request }: { request: SelectedSupplyRequest }) {
  return (
    <View style={styles.submissionBlock} wrap={false}>
      <View style={styles.submissionHeaderRow}>
        <View>
          <Text style={styles.submissionHeaderTitle}>
            {formatCrewDateTime(request.createdAt)} · Supply request
          </Text>
          <Text style={styles.submissionHeaderMeta}>{request.reporterName || "Unknown crew member"}</Text>
        </View>
      </View>
      {request.lines.map((line, index) => (
        <View key={index} style={styles.checklistItemRow}>
          <Text style={styles.supplyQty}>{line.qty}×</Text>
          <View style={styles.checklistItemText}>
            <Text style={styles.checklistItemLabel}>
              {line.itemName}
              {line.unit ? ` (${line.unit})` : ""}
            </Text>
          </View>
        </View>
      ))}
      {request.otherItems ? (
        <View style={styles.generalNotesBox}>
          <Text style={styles.generalNotesText}>Other supplies: {request.otherItems}</Text>
        </View>
      ) : null}
      {request.note ? (
        <View style={styles.generalNotesBox}>
          <Text style={styles.generalNotesText}>Note: {request.note}</Text>
        </View>
      ) : null}
    </View>
  );
}

export type SelectedReportItem =
  | { kind: "checklist"; at: string; checklist: PorterChecklistReportSubmission }
  | { kind: "supplies"; at: string; supplies: SelectedSupplyRequest };

export type SelectedReportGroup = { accountName: string; address: string; items: SelectedReportItem[] };

export type SelectedReportData = {
  title: string;
  generatedDate: string;
  // One group per account; the caller sorts groups and items newest first.
  groups: SelectedReportGroup[];
};

// "Share selected" on the Submitted page: only the picked checklists and
// supply requests, grouped by account, newest first.
export function SelectedSubmissionsReportDocument(data: SelectedReportData) {
  const total = data.groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <Document title={`Cleaning Report - ${data.title}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop */}
            <Image src={{ data: getLogoBuffer(), format: "jpg" }} style={styles.logo} />
          </View>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Cleaning Report</Text>
            <Text style={styles.headerSubtitle}>{data.title}</Text>
            <Text style={styles.headerMeta}>
              {total} submission{total === 1 ? "" : "s"} &middot; Generated {data.generatedDate}
            </Text>
          </View>
        </View>

        <View style={styles.accentBar} />

        <View style={styles.body}>
          {data.groups.map((group, index) => (
            <View key={`${group.accountName}-${index}`} break={index > 0}>
              <Text style={styles.sectionTitle}>
                {group.accountName}
                {group.address ? ` · ${group.address}` : ""}
              </Text>
              {group.items.map((item) =>
                item.kind === "checklist" ? (
                  <ChecklistBlock key={`c-${item.checklist.id}`} submission={item.checklist} />
                ) : (
                  <SupplyBlock key={`s-${item.supplies.id}`} request={item.supplies} />
                )
              )}
            </View>
          ))}
        </View>

        <ReportFooter />
      </Page>
    </Document>
  );
}

export async function renderSelectedSubmissionsReportPdf(data: SelectedReportData): Promise<Buffer> {
  return renderToBuffer(<SelectedSubmissionsReportDocument {...data} />);
}

export async function renderPorterChecklistReportPdf(data: PorterChecklistReportData): Promise<Buffer> {
  return renderToBuffer(<PorterChecklistReportDocument {...data} />);
}
