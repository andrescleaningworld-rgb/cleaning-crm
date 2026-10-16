// The Overview dashboard's plain-words layer: the traffic light of each
// section, the "How are we doing?" sentences and the "Needs attention" list.
// Pure functions of numbers the page has already counted (app/overview), so
// nothing here reads or writes data. Every sentence states a counted fact;
// nothing is estimated.

/**
 * When a section turns WATCH (yellow) or PROBLEM (red). Change the numbers
 * here; nothing else needs to change.
 */
export const OVERVIEW_THRESHOLDS = {
  money: {
    /** "We keep" (gross margin) below this percent: PROBLEM. */
    weKeepProblemBelowPercent: 20,
    /** Below this percent (but not below the PROBLEM line): WATCH. */
    weKeepWatchBelowPercent: 25,
  },
  complaints: {
    /** An open complaint older than this many days: PROBLEM. Any other open complaint: WATCH. */
    openProblemAfterDays: 5,
  },
  visits: {
    /** An active account with no visit in this many days: WATCH. */
    notVisitedDays: 60,
  },
  accounts: {
    /** Accounts that need you (High Risk, or an open crew problem): this many or more is WATCH… */
    needYouWatchAt: 1,
    /** …and this many or more is PROBLEM. */
    needYouProblemAt: 5,
    /** An active account with no sub assigned: PROBLEM. */
    noSubProblemAt: 1,
  },
  supplies: {
    /** A new supply order still waiting: WATCH. Waiting longer than this many days: PROBLEM. */
    waitingProblemAfterDays: 3,
  },
  activity: {
    /** Overdue to-dos: this many or more is WATCH… */
    overdueWatchAt: 1,
    /** …and this many or more is PROBLEM. */
    overdueProblemAt: 10,
  },
} as const;

export type Light = "good" | "watch" | "problem";

export const LIGHT_WORD: Record<Light, string> = { good: "GOOD", watch: "WATCH", problem: "PROBLEM" };
/** A shape next to the word, so the light never depends on color alone. */
export const LIGHT_SYMBOL: Record<Light, string> = { good: "✓", watch: "!", problem: "✕" };

/** Everything the page counted. null = that part did not load (it is then left out, never guessed). */
export type OverviewFacts = {
  money: {
    moneyIn: number;
    paidToSubs: number;
    weKeep: number;
    weKeepPercent: number;
    billedAccounts: number;
    startedThisMonth: { count: number; moneyIn: number };
    cancelledThisMonth: { count: number; moneyIn: number };
  } | null;
  complaints: { open: number; openOld: number } | null;
  visits: { thisMonth: number; notVisited: number } | null;
  accounts: { active: number; needYou: number; noSub: number } | null;
  supplies: { waiting: number; waitingOld: number } | null;
  activity: { overdue: number; open: number; doneThisWeek: number } | null;
};

export type SectionKey = "money" | "complaints" | "visits" | "accounts" | "supplies" | "activity";

const T = OVERVIEW_THRESHOLDS;

/** The traffic light of each section, or null when its data did not load. */
export function sectionLights(f: OverviewFacts): Record<SectionKey, Light | null> {
  return {
    money: !f.money
      ? null
      : f.money.moneyIn <= 0
        ? "watch"
        : f.money.weKeepPercent < T.money.weKeepProblemBelowPercent
          ? "problem"
          : f.money.weKeepPercent < T.money.weKeepWatchBelowPercent
            ? "watch"
            : "good",
    complaints: !f.complaints ? null : f.complaints.openOld > 0 ? "problem" : f.complaints.open > 0 ? "watch" : "good",
    visits: !f.visits ? null : f.visits.notVisited > 0 ? "watch" : "good",
    accounts: !f.accounts
      ? null
      : f.accounts.noSub >= T.accounts.noSubProblemAt || f.accounts.needYou >= T.accounts.needYouProblemAt
        ? "problem"
        : f.accounts.needYou >= T.accounts.needYouWatchAt
          ? "watch"
          : "good",
    supplies: !f.supplies ? null : f.supplies.waitingOld > 0 ? "problem" : f.supplies.waiting > 0 ? "watch" : "good",
    activity: !f.activity
      ? null
      : f.activity.overdue >= T.activity.overdueProblemAt
        ? "problem"
        : f.activity.overdue >= T.activity.overdueWatchAt
          ? "watch"
          : "good",
  };
}

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "How are we doing?": at most 5 plain sentences, only from what loaded. */
export function summarySentences(f: OverviewFacts): string[] {
  const lines: string[] = [];
  if (f.money) {
    lines.push(`Every month we bill ${money(f.money.moneyIn)} across ${plural(f.money.billedAccounts, "account", "accounts")}.`);
    lines.push(`We keep ${money(f.money.weKeep)} of it after paying subs (${Math.round(f.money.weKeepPercent)}%).`);
    const started = f.money.startedThisMonth;
    const cancelled = f.money.cancelledThisMonth;
    if (started.count === 0 && cancelled.count === 0) {
      lines.push("No account started or cancelled this month.");
    } else {
      const parts: string[] = [];
      if (started.count > 0) parts.push(`${plural(started.count, "new account", "new accounts")} started (${money(started.moneyIn)} a month)`);
      if (cancelled.count > 0) parts.push(`${plural(cancelled.count, "account", "accounts")} cancelled (${money(cancelled.moneyIn)} a month)`);
      lines.push(`This month ${parts.join(" and ")}.`);
    }
  }
  if (f.complaints) {
    lines.push(
      f.complaints.open === 0
        ? "No complaint is open."
        : `${plural(f.complaints.open, "complaint is", "complaints are")} open${f.complaints.openOld > 0 ? `, ${f.complaints.openOld.toLocaleString("en-US")} of them for more than ${T.complaints.openProblemAfterDays} days` : ""}.`
    );
  }
  if (f.visits && f.visits.notVisited > 0) {
    lines.push(`${plural(f.visits.notVisited, "account has", "accounts have")} not been visited in ${T.visits.notVisitedDays} days.`);
  } else if (f.activity && f.activity.overdue > 0) {
    lines.push(`${plural(f.activity.overdue, "to-do is", "to-dos are")} overdue.`);
  }
  return lines.slice(0, 5);
}

export type AttentionItem = { light: Exclude<Light, "good">; text: string; href: string };

/** "Needs attention": the most important problems first (red before yellow), at most 5. */
export function attentionItems(f: OverviewFacts): AttentionItem[] {
  const items: AttentionItem[] = [];
  const add = (light: AttentionItem["light"], text: string, href: string) => items.push({ light, text, href });

  if (f.complaints && f.complaints.openOld > 0) {
    add("problem", `${plural(f.complaints.openOld, "complaint has", "complaints have")} been open more than ${T.complaints.openProblemAfterDays} days.`, "/complaints?status=open");
  }
  if (f.money && f.money.moneyIn > 0 && f.money.weKeepPercent < T.money.weKeepProblemBelowPercent) {
    add("problem", `We keep only ${Math.round(f.money.weKeepPercent)}% after paying subs. The line is ${T.money.weKeepProblemBelowPercent}%.`, "/reports");
  }
  if (f.accounts && f.accounts.noSub >= T.accounts.noSubProblemAt) {
    add("problem", `${plural(f.accounts.noSub, "active account has", "active accounts have")} no sub assigned.`, "/accounts-center?show=active");
  }
  if (f.accounts && f.accounts.needYou >= T.accounts.needYouProblemAt) {
    add("problem", `${plural(f.accounts.needYou, "account needs", "accounts need")} you (High Risk, or a problem the crew reported).`, "/accounts-center?show=need-you");
  }
  if (f.supplies && f.supplies.waitingOld > 0) {
    add("problem", `${plural(f.supplies.waitingOld, "supply order has", "supply orders have")} waited more than ${T.supplies.waitingProblemAfterDays} days.`, "/supply-orders");
  }
  if (f.activity && f.activity.overdue >= T.activity.overdueProblemAt) {
    add("problem", `${plural(f.activity.overdue, "to-do is", "to-dos are")} overdue.`, "/to-do?filter=pending");
  }

  if (f.complaints && f.complaints.openOld === 0 && f.complaints.open > 0) {
    add("watch", `${plural(f.complaints.open, "complaint is", "complaints are")} open.`, "/complaints?status=open");
  }
  if (f.money && f.money.moneyIn > 0 && f.money.weKeepPercent >= T.money.weKeepProblemBelowPercent && f.money.weKeepPercent < T.money.weKeepWatchBelowPercent) {
    add("watch", `We keep ${Math.round(f.money.weKeepPercent)}% after paying subs, close to the ${T.money.weKeepProblemBelowPercent}% line.`, "/reports");
  }
  if (f.accounts && f.accounts.needYou >= T.accounts.needYouWatchAt && f.accounts.needYou < T.accounts.needYouProblemAt) {
    add("watch", `${plural(f.accounts.needYou, "account needs", "accounts need")} you (High Risk, or a problem the crew reported).`, "/accounts-center?show=need-you");
  }
  if (f.visits && f.visits.notVisited > 0) {
    add("watch", `${plural(f.visits.notVisited, "account has", "accounts have")} not been visited in ${T.visits.notVisitedDays} days.`, "/visits");
  }
  if (f.activity && f.activity.overdue >= T.activity.overdueWatchAt && f.activity.overdue < T.activity.overdueProblemAt) {
    add("watch", `${plural(f.activity.overdue, "to-do is", "to-dos are")} overdue.`, "/to-do?filter=pending");
  }
  if (f.supplies && f.supplies.waitingOld === 0 && f.supplies.waiting > 0) {
    add("watch", `${plural(f.supplies.waiting, "new supply order is", "new supply orders are")} waiting.`, "/supply-orders");
  }
  return items.slice(0, 5);
}

/** One sentence that says what a monthly chart shows. Only full months count toward "in a row". */
export function chartCaption(months: { label: string; value: number }[], noun: string): string {
  // The last bar is this month, still going: it is not compared.
  const full = months.slice(0, -1);
  if (full.length < 2) return `${noun[0].toUpperCase()}${noun.slice(1)} by month.`;
  let up = 0;
  let down = 0;
  for (let i = full.length - 1; i > 0; i--) {
    if (full[i].value > full[i - 1].value && down === 0) up++;
    else if (full[i].value < full[i - 1].value && up === 0) down++;
    else break;
  }
  const last = full[full.length - 1];
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`;
  if (up >= 2) return `${Noun} went up ${up} months in a row, to ${last.value.toLocaleString("en-US")} in ${last.label}.`;
  if (down >= 2) return `${Noun} went down ${down} months in a row, to ${last.value.toLocaleString("en-US")} in ${last.label}.`;
  const high = full.reduce((a, b) => (b.value > a.value ? b : a));
  return `${Noun}: ${last.value.toLocaleString("en-US")} in ${last.label}. The most was ${high.value.toLocaleString("en-US")}, in ${high.label}.`;
}
