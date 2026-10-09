// Help -> How it works: one picture per flow, in plain words. The pictures
// are drawn from the same step lists the screens use (lib/handoffs.ts), so
// they cannot drift from what the app does.

import Link from "next/link";
import { BigButton, Screen } from "@/app/ui";
import { ONBOARDING_DEFAULTS, ORDER_STEPS, UPDATE_STEPS, sectionName } from "@/lib/handoffs";
import { ONBOARDING_CHECKLIST_SECTIONS } from "@/lib/onboardingChecklist";

type Box = { label: string; who: string };

const WHO_COLOR: Record<string, { fill: string; ink: string }> = {
  Office: { fill: "#E6F1FB", ink: "#0C447C" },
  Manager: { fill: "#EAF3DE", ink: "#27500A" },
  Sub: { fill: "#FDF0DC", ink: "#8A5300" },
  Done: { fill: "#ECEFF3", ink: "#52627A" },
};

/** One flow as a row of boxes joined by arrows. Wraps to several rows on a phone. */
function FlowPicture({ title, boxes }: { title: string; boxes: Box[] }) {
  const perRow = 2;
  const boxW = 150;
  const boxH = 84;
  const gapX = 34;
  const gapY = 30;
  const rows = Math.ceil(boxes.length / perRow);
  const width = perRow * boxW + (perRow - 1) * gapX;
  const height = rows * boxH + (rows - 1) * gapY;
  const place = (index: number) => ({ x: (index % perRow) * (boxW + gapX), y: Math.floor(index / perRow) * (boxH + gapY) });
  return (
    <svg className="ui-flow" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${boxes.map((box) => `${box.label} (${box.who})`).join(", then ")}`}>
      {boxes.map((box, index) => {
        const { x, y } = place(index);
        const color = WHO_COLOR[box.who] ?? WHO_COLOR.Done;
        const next = index + 1 < boxes.length ? place(index + 1) : null;
        const words = box.label.split(" ");
        const half = Math.ceil(words.length / 2);
        const lines = box.label.length > 15 ? [words.slice(0, half).join(" "), words.slice(half).join(" ")] : [box.label];
        return (
          <g key={`${box.label}-${index}`}>
            <rect x={x} y={y} width={boxW} height={boxH} rx={14} fill={color.fill} stroke={color.ink} strokeWidth={2} />
            <text x={x + boxW / 2} y={y + 20} textAnchor="middle" fontSize={12} fontWeight={800} fill={color.ink}>
              {index + 1}. {box.who.toUpperCase()}
            </text>
            {lines.map((line, lineIndex) => (
              <text key={line} x={x + boxW / 2} y={y + (lines.length === 1 ? 52 : 44) + lineIndex * 17} textAnchor="middle" fontSize={14} fontWeight={700} fill="#10233F">
                {line}
              </text>
            ))}
            {next ? (
              next.y === y ? (
                <path d={`M${x + boxW + 4} ${y + boxH / 2} H${next.x - 10} m-7 -6 l7 6 l-7 6`} fill="none" stroke="#52627A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path
                  d={`M${x + boxW / 2} ${y + boxH + 3} V${y + boxH + gapY / 2} H${next.x + boxW / 2} V${next.y - 9} m-6 -7 l6 7 l6 -7`}
                  fill="none"
                  stroke="#52627A"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

const who = (owner: string) => (owner === "office" ? "Office" : owner === "manager" ? "Manager" : owner === "sub" ? "Sub" : "Done");

export default function HowItWorksPage() {
  const newAccount: Box[] = [
    { label: "Add accepted estimate", who: "Manager" },
    ...ONBOARDING_CHECKLIST_SECTIONS.map((section) => ({ label: sectionName(section.key), who: who(ONBOARDING_DEFAULTS[section.key]?.owner ?? "office") })),
  ];
  const update: Box[] = [
    { label: "Add update", who: "Manager" },
    { label: "Mark processed", who: who(UPDATE_STEPS[0].owner) },
    { label: "Sees Processed ✓", who: "Manager" },
  ];
  const order: Box[] = [
    { label: "Orders supplies", who: "Sub" },
    { label: "Approve order", who: who(ORDER_STEPS[0].owner) },
    { label: "Mark bought", who: who(ORDER_STEPS[1].owner) },
    { label: "Mark delivered", who: who(ORDER_STEPS[2].owner) },
  ];

  return (
    <Screen title="How it works" subtitle="Three things move between the managers and the office. The app carries them, so nothing is on paper." backHref="/help">
      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">The idea</h2>
        <p>
          Each thing is always waiting on <span className="ui-strong">one person</span>. That person sees it in <span className="ui-strong">My work</span> on the Dashboard.
        </p>
        <p>
          They open it, do their part, and tap its <span className="ui-strong">one green button</span>. The app says &quot;Done ✓ — sent to …&quot; and the next person gets it. You have 5 seconds
          to tap Undo.
        </p>
        <p>
          <span className="ui-strong">Red</span> means late. Do red first.
        </p>
        <BigButton href="/">Open My work</BigButton>
      </section>

      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">1. A new account</h2>
        <FlowPicture title="A new account" boxes={newAccount} />
        <p>Open the account and tap Add accepted estimate: take a photo or pick the PDF. The account goes on the New accounts board.</p>
        <p>Then it goes through the checklist, one section at a time. Tick the last box of your section and the next person gets it. Each section has a due date, counted from the day the estimate was accepted.</p>
        <Link href="/accounts-center?tab=new" className="ui-btn ui-btn-second">
          See the New accounts board
        </Link>
      </section>

      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">2. An account update</h2>
        <FlowPicture title="An account update" boxes={update} />
        <p>An extra job, a sale, a price or schedule change: the manager taps Add update. It lands on the office&apos;s To process list, oldest first.</p>
        <p>The office enters it and taps Mark processed. The manager sees &quot;Processed ✓ by [name], [day]&quot; on the update.</p>
        <Link href="/account-updates" className="ui-btn ui-btn-second">
          See Account Updates
        </Link>
      </section>

      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">3. A supply order</h2>
        <FlowPicture title="A supply order" boxes={order} />
        <p>A subcontractor orders supplies in their portal. The account&apos;s manager approves it. The office buys it, then marks it delivered.</p>
        <Link href="/supply-orders" className="ui-btn ui-btn-second">
          See Supply Orders
        </Link>
      </section>

      <section className="ui-card ui-stack">
        <h2 className="ui-card-title">Who is &quot;Office&quot;?</h2>
        <p>The owner picks the Office people, and the number of days before something turns red, in Settings → Team.</p>
        <Link href="/settings/team" className="ui-btn ui-btn-second">
          Open Settings → Team
        </Link>
      </section>
    </Screen>
  );
}
