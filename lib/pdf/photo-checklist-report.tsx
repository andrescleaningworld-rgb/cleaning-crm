// Server only: the Photo Checklist "Work Report" PDF (lib/photoChecklist.ts),
// laid out like the Timemark app's report the crews already know:
//   1. cover: Cleaning World, "Work Report", the account, the date, the team,
//      start / end time, "Prepared by <name>", how many photos
//   2. the checklist: each item Done / Can't do (why) / Not done
//   3. the photos, grouped by item, 3 per page, each with its number, time,
//      item and who took it; a gallery photo taken earlier than the visit is
//      flagged ("Photo taken Nov 16, 3:10 PM"), one with no time inside says
//      "Added later"
// Customer-facing: never says "sub" (the team is "Team"), no prices, no
// internal notes. Photos are the stamped copies (what the portal shows),
// made smaller here so the file stays small.

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { SKIP_REASON_WORDS, type ChecklistSubmissionSection, type SkipReason } from "@/lib/checklistTemplate";
import { EXTRA_ITEM_KEY, stampTimeText } from "@/lib/photoChecklist";
import type { VisitPhoto } from "@/lib/pg/photo-checklist";
import { TEAM_HUB_TIMEZONE } from "@/lib/teamHubTimezone";
import { PDF_LOGO_WIDTH } from "@/lib/pdf/supply-order";
import { openStoredFile } from "@/lib/files";

const BLUE = "#003b7a";
const LIGHT = "#00a8e8";
const GREY = "#64748b";
const LINE = "#dbeafe";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#0f172a", paddingBottom: 40 },
  band: { backgroundColor: BLUE, paddingVertical: 14, paddingHorizontal: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logoBox: { backgroundColor: "#ffffff", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  logo: { width: PDF_LOGO_WIDTH * 0.8, height: "auto" },
  bandText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 12 },
  accent: { height: 4, backgroundColor: LIGHT },
  body: { paddingHorizontal: 36, paddingTop: 18 },
  coverTitle: { fontFamily: "Helvetica-Bold", fontSize: 34, color: BLUE, marginTop: 60 },
  coverPlace: { fontFamily: "Helvetica-Bold", fontSize: 20, marginTop: 10 },
  coverDate: { fontSize: 14, color: GREY, marginTop: 4 },
  facts: { marginTop: 36, borderTopWidth: 1, borderTopColor: LINE },
  fact: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 10 },
  factLabel: { width: 150, color: GREY, fontSize: 11 },
  factValue: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 12 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 14, color: BLUE, marginBottom: 8 },
  groupTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, color: GREY, textTransform: "uppercase", marginTop: 8, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 6 },
  rowItem: { flex: 1, paddingRight: 8 },
  status: { width: 150, fontFamily: "Helvetica-Bold" },
  done: { color: "#166534" },
  skipped: { color: "#92400e" },
  notDone: { color: "#b91c1c" },
  photoBlock: { height: 235, marginBottom: 8, flexDirection: "row", borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 6 },
  photo: { width: 300, height: 221, objectFit: "contain", backgroundColor: "#f1f5f9" },
  photoInfo: { flex: 1, paddingLeft: 10, paddingTop: 4 },
  photoNumber: { fontFamily: "Helvetica-Bold", fontSize: 22, color: BLUE },
  photoLine: { fontSize: 10, marginTop: 6 },
  photoLabel: { color: GREY, fontSize: 8, textTransform: "uppercase", marginTop: 8 },
  flag: { marginTop: 8, fontFamily: "Helvetica-Bold", color: "#92400e", fontSize: 10 },
  footer: { position: "absolute", bottom: 16, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: GREY },
});

let cachedLogo: Buffer | null = null;
function logo(): Buffer {
  cachedLogo ??= fs.readFileSync(path.join(process.cwd(), "public", "cw-logo.jpg"));
  return cachedLogo;
}

export type WorkReportData = {
  placeName: string;
  teamName: string;
  preparedBy: string;
  tabName: string | null;
  startedAt: string | null;
  finishedAt: string;
  sections: ChecklistSubmissionSection[];
  photos: VisitPhoto[];
};

const timeOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { timeZone: TEAM_HUB_TIMEZONE, hour: "numeric", minute: "2-digit" }) : "—");
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TEAM_HUB_TIMEZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** The photo, smaller (900px), as a JPEG for the PDF. null when it cannot be fetched or read. */
async function photoForPdf(url: string): Promise<Buffer | null> {
  try {
    const opened = await openStoredFile(url);
    if (!opened) return null;
    const input = Buffer.from(opened.data);
    return await sharp(input).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(list: T[], limit: number, work: (each: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const index = next++;
        out[index] = await work(list[index]);
      }
    })
  );
  return out;
}

function Band({ right }: { right: string }) {
  return (
    <>
      <View style={styles.band} fixed>
        <View style={styles.logoBox}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image (a PDF, not the DOM) has no alt prop */}
          <Image src={{ data: logo(), format: "jpg" }} style={styles.logo} />
        </View>
        <Text style={styles.bandText}>{right}</Text>
      </View>
      <View style={styles.accent} fixed />
    </>
  );
}

function Footer({ placeName, day }: { placeName: string; day: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        Cleaning World · Work Report · {placeName} · {day}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export async function renderWorkReportPdf(data: WorkReportData): Promise<Buffer> {
  const day = longDate(data.startedAt ?? data.finishedAt);
  const tasks = data.sections.filter((section) => section.items.some((item) => !item.info));
  const order = new Map<string, { label: string; index: number }>();
  tasks.flatMap((section) => section.items.filter((item) => !item.info)).forEach((item, index) => order.set(item.key, { label: item.label, index }));
  const images = data.photos.filter((photo) => photo.isImage);
  // Grouped by item, in the checklist's order; extra photos (and any of an item no longer on the list) last; each group by time.
  const sorted = [...images].sort((a, b) => {
    const ai = order.get(a.itemKey)?.index ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b.itemKey)?.index ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.takenAt.localeCompare(b.takenAt);
  });
  const files = await mapLimit(sorted, 4, (photo) => photoForPdf(photo.url));
  const shown = sorted.map((photo, index) => ({ photo, file: files[index] })).filter((each) => each.file);
  const pages: (typeof shown)[] = [];
  for (let i = 0; i < shown.length; i += 3) pages.push(shown.slice(i, i + 3));
  const itemName = (photo: VisitPhoto) => (photo.itemKey === EXTRA_ITEM_KEY ? "Extra photo" : (order.get(photo.itemKey)?.label ?? photo.caption ?? ""));

  const doneCount = tasks.reduce((sum, section) => sum + section.items.filter((item) => !item.info && item.checked).length, 0);
  const totalCount = tasks.reduce((sum, section) => sum + section.items.filter((item) => !item.info).length, 0);

  const document = (
    <Document title={`Work Report - ${data.placeName} - ${day}`} author="Cleaning World">
      {/* 1. Cover */}
      <Page size="LETTER" style={styles.page}>
        <Band right="Work Report" />
        <View style={styles.body}>
          <Text style={styles.coverTitle}>Work Report</Text>
          <Text style={styles.coverPlace}>{data.placeName}</Text>
          <Text style={styles.coverDate}>{day}</Text>
          <View style={styles.facts}>
            {data.teamName ? (
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Team</Text>
                <Text style={styles.factValue}>{data.teamName}</Text>
              </View>
            ) : null}
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Prepared by</Text>
              <Text style={styles.factValue}>{data.preparedBy}</Text>
            </View>
            {data.tabName ? (
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Checklist</Text>
                <Text style={styles.factValue}>{data.tabName}</Text>
              </View>
            ) : null}
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Start</Text>
              <Text style={styles.factValue}>{timeOnly(data.startedAt)}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>End</Text>
              <Text style={styles.factValue}>{timeOnly(data.finishedAt)}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Checklist done</Text>
              <Text style={styles.factValue}>
                {doneCount} of {totalCount}
              </Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Photos</Text>
              <Text style={styles.factValue}>{shown.length}</Text>
            </View>
          </View>
        </View>
        <Footer placeName={data.placeName} day={day} />
      </Page>

      {/* 2. The checklist */}
      <Page size="LETTER" style={styles.page}>
        <Band right={data.placeName} />
        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Checklist</Text>
          {tasks.map((section) => (
            <View key={section.key}>
              {tasks.length > 1 ? <Text style={styles.groupTitle}>{section.title}</Text> : null}
              {section.items
                .filter((item) => !item.info)
                .map((item) => (
                  <View key={item.key} style={styles.row} wrap={false}>
                    <Text style={styles.rowItem}>{item.label}</Text>
                    {item.checked ? (
                      <Text style={[styles.status, styles.done]}>Done</Text>
                    ) : item.skipReason ? (
                      <Text style={[styles.status, styles.skipped]}>Can&apos;t do: {SKIP_REASON_WORDS[item.skipReason as SkipReason] ?? item.skipReason}</Text>
                    ) : (
                      <Text style={[styles.status, styles.notDone]}>Not done</Text>
                    )}
                  </View>
                ))}
            </View>
          ))}
        </View>
        <Footer placeName={data.placeName} day={day} />
      </Page>

      {/* 3. Photos, 3 per page */}
      {pages.map((page, pageIndex) => (
        <Page key={pageIndex} size="LETTER" style={styles.page}>
          <Band right={data.placeName} />
          <View style={styles.body}>
            {page.map(({ photo, file }, index) => {
              const number = pageIndex * 3 + index + 1;
              return (
                <View key={photo.id} style={styles.photoBlock} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt prop */}
                  <Image src={{ data: file!, format: "jpg" }} style={styles.photo} />
                  <View style={styles.photoInfo}>
                    <Text style={styles.photoNumber}>#{number}</Text>
                    <Text style={styles.photoLabel}>Time</Text>
                    <Text style={styles.photoLine}>{stampTimeText(photo.takenAt)}</Text>
                    <Text style={styles.photoLabel}>Item</Text>
                    <Text style={styles.photoLine}>{itemName(photo)}</Text>
                    <Text style={styles.photoLabel}>By</Text>
                    <Text style={styles.photoLine}>{photo.takenBy}</Text>
                    {photo.flag === "early" ? <Text style={styles.flag}>Photo taken {stampTimeText(photo.takenAt).replace(" · ", ", ")}</Text> : null}
                    {photo.flag === "added_later" ? <Text style={styles.flag}>Added later (no time in the photo)</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
          <Footer placeName={data.placeName} day={day} />
        </Page>
      ))}
    </Document>
  );
  return renderToBuffer(document);
}
