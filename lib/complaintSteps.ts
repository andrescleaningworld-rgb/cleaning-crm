// The ONE set of complaint steps, drawn with the shared pizza tracker
// (app/components/pizza-tracker.tsx) in three places:
//
//   1. Received          the complaint is logged
//   2. Sent to team      the account's team (sub) was told about it
//   3. Team on it        the team said "Got it" (or the status is In Progress)
//   4. Ready to review   the team marked it resolved; the office checks it
//   5. Fixed             the office reviewed and closed it
//
//   Staff (complaint page, Pin Board):  all 5, with who it waits on; red after
//                                       2 business days on one step (the New
//                                       Account rule, lib/accountFlow.ts).
//   Team (sub portal):                  steps 2-5.
//   Customer (portal):                  Received → Team on it → Fixed. Steps 2,
//                                       3 and 4 all read "Team on it": the
//                                       customer never sees the review.
//
// Facts come from lib/pg/complaint-track.ts. Safe in the browser.

import { businessDaysBetween, firstName, FLOW_RED_BUSINESS_DAYS, officeDay } from "@/lib/accountFlow";
import type { TrackerStep, TrackerView } from "@/app/components/pizza-tracker";

export type ComplaintStep = "received" | "sent" | "team" | "review" | "fixed";

export const COMPLAINT_STEPS: { key: ComplaintStep; tracker: string }[] = [
  { key: "received", tracker: "Received" },
  { key: "sent", tracker: "Sent to team" },
  { key: "team", tracker: "Team on it" },
  { key: "review", tracker: "Ready to review" },
  { key: "fixed", tracker: "Fixed" },
];

/** What a complaint's step is worked out from (ISO times, "" when it did not happen / is not known). */
export type ComplaintStepFacts = {
  status: string;
  createdAt: string;
  /** First time the team was told (a sent notice, or the pin put on "Waiting on team"). */
  sentAt: string;
  /** First time the team answered ("Got it" from the team, or status In Progress). */
  teamAt: string;
  /** Latest time the team marked it resolved (status "Resolved by Sub"). */
  reviewAt: string;
  /** Latest time the office closed / resolved it. */
  fixedAt: string;
  /** The manager it is assigned to ("" = the office). */
  office: string;
  /** The account's team (sub) name, staff screens only ("" = "the team"). */
  team: string;
};

/** A complaint's tracker: the shared view, plus when each of the 5 steps was reached. */
export type ComplaintTrackView = TrackerView & { step: ComplaintStep; at: string[] };

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** Merged complaints have no tracker (they live on in the main one). */
export const isMergedStatus = (status: unknown) => lower(status).startsWith("merged");
/** The team says it is fixed; the office has not closed it yet. */
export const isReviewStatus = (status: unknown) => lower(status).startsWith("resolved by sub");
/** The office closed / resolved it (not the team's "Resolved by Sub", not Merged). */
export const isOfficeFixedStatus = (status: unknown) => /^(closed|resolved)/.test(lower(status)) && !isReviewStatus(status);

/** All 5 steps, for staff. Null for a merged complaint. */
export function complaintTrackView(f: ComplaintStepFacts, now = new Date()): ComplaintTrackView | null {
  if (isMergedStatus(f.status)) return null;
  const s = lower(f.status);
  const index = isOfficeFixedStatus(s) ? 4 : isReviewStatus(s) ? 3 : f.teamAt || s.startsWith("in progress") ? 2 : f.sentAt ? 1 : 0;
  const step = COMPLAINT_STEPS[index].key;
  const at = [f.createdAt, f.sentAt, f.teamAt, index >= 3 ? f.reviewAt : "", index === 4 ? f.fixedAt : ""];
  // Stuck since the step was reached (or the latest earlier step we know of).
  const since = at.slice(0, index + 1).filter(Boolean).sort().pop() || f.createdAt;
  const red = index < 4 && Boolean(since) && businessDaysBetween(officeDay(since), officeDay(now)) >= FLOW_RED_BUSINESS_DAYS;
  const office = firstName(f.office) ? `with ${firstName(f.office)}` : "with the office";
  const team = f.team.trim() ? `with ${f.team.trim()}` : "with the team";
  // Received: the office has to send it on. Sent / Team on it: the team. Ready to review: the office.
  const withWho = index === 4 ? "" : index === 1 || index === 2 ? team : office;
  return {
    step,
    index,
    now: index === 4 ? "Fixed" : `${COMPLAINT_STEPS[index].tracker} - ${withWho}`,
    withWho,
    red,
    done: COMPLAINT_STEPS.slice(0, index).map((entry) => entry.key),
    at,
  };
}

/** The team's view (sub portal): steps 2-5, nobody named. */
export const SUB_COMPLAINT_STEPS: TrackerStep[] = COMPLAINT_STEPS.slice(1);

export function subTrackView(view: ComplaintTrackView): TrackerView {
  const index = Math.max(0, view.index - 1);
  const words = ["Sent to you", "You are on it", "Office is reviewing", "Fixed"];
  return { step: SUB_COMPLAINT_STEPS[index].key, index, now: words[index], withWho: "", red: false, done: SUB_COMPLAINT_STEPS.slice(0, index).map((s) => s.key), at: view.at.slice(1) };
}

/** The customer's 3 steps (Received → Team on it → Fixed). Words come from the portal, in the customer's language. */
export function customerTrackView(view: ComplaintTrackView, words: [string, string, string]): TrackerView {
  const index = view.index === 4 ? 2 : view.index === 0 ? 0 : 1;
  const teamAt = [view.at[1], view.at[2]].filter(Boolean).sort()[0] ?? "";
  const keys = ["received", "team", "fixed"];
  return { step: keys[index], index, now: words[index], withWho: "", red: false, done: keys.slice(0, index), at: [view.at[0], teamAt, view.at[4]] };
}

/** The customer's step names as tracker steps. */
export const customerSteps = (words: [string, string, string]): TrackerStep[] => words.map((tracker, i) => ({ key: ["received", "team", "fixed"][i], tracker }));
