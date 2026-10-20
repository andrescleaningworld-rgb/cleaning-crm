// The New Account pizza tracker: Packet > Sub picked > Sub OK > Customer
// called > Site survey > Walkthrough > Start date > First-clean follow-up >
// Live. Finished steps are filled in green, the current one in blue (red
// when it has had no progress for 2 business days), with who it is with.
//   size "pin"   a thin bar and one line, for a paper on the board and the TV
//   size "full"  every step named, for the account page and an opened paper
// The rules are in lib/accountFlow.ts.

import { FLOW_STEPS, type FlowView } from "@/lib/accountFlow";

export default function PizzaTracker({ view, size = "full" }: { view: FlowView; size?: "pin" | "full" }) {
  const live = view.step === "live";
  const stateOf = (index: number) => (live || index < view.index ? "is-done" : index === view.index ? "is-now" : "");
  const summary = live ? "Live: every step is done." : `Step ${view.index + 1} of ${FLOW_STEPS.length - 1}: ${view.now}.${view.red ? " No progress for 2 work days." : ""}`;

  if (size === "pin") {
    return (
      <span className={`cw-pizza cw-pizza-pin ${view.red ? "is-red" : ""}`}>
        <span className="cw-pizza-bar" aria-hidden="true">
          {FLOW_STEPS.map((step, index) => (
            <span key={step.key} className={`cw-pizza-seg ${stateOf(index)}`} />
          ))}
        </span>
        <span className="cw-pizza-now">{live ? "✓ Live" : view.now}</span>
        <span className="ui-visually-hidden">{summary}</span>
      </span>
    );
  }

  return (
    <div className={`cw-pizza cw-pizza-full ${view.red ? "is-red" : ""}`}>
      <ol className="cw-pizza-steps" aria-label="New account steps">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.key} className={`cw-pizza-step ${stateOf(index)}`} aria-current={index === view.index && !live ? "step" : undefined}>
            <span className="cw-pizza-seg" aria-hidden="true" />
            <span className="cw-pizza-label">{step.tracker}</span>
          </li>
        ))}
      </ol>
      <p className="cw-pizza-now">{live ? "✓ Live" : view.now}</p>
      <span className="ui-visually-hidden">{summary}</span>
    </div>
  );
}
