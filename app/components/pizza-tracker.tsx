// The New Account pizza tracker: Packet > Sub picked > Sub OK > Customer
// called > Site survey > Walkthrough > Start date > First-clean follow-up >
// Live. Finished steps are filled in green, the current one in blue (red
// when it has had no progress for 2 business days), with who it is with.
//   size "pin"   a thin bar and one line, for a paper on the board and the TV
//   size "full"  every step named, for the account page
//   size "list"  one stage per line (check, big dot, gray), for an opened paper on the board
//                and the account page. With `actions` (the account page), a done step has a
//                small "Undo" and a step still to do has a small "Mark done".
// A step done ahead of the current one (e.g. the sub was already on the account) is green too.
// The rules are in lib/accountFlow.ts.

import { FLOW_STEPS, type FlowStep, type FlowView } from "@/lib/accountFlow";

export type TrackerActions = {
  busy: boolean;
  /** Whether this not-done step gets the small "Mark done" (the current step's big button may already be it). */
  canMark: (step: FlowStep) => boolean;
  onMarkDone: (step: FlowStep) => void;
  onUndo: (step: FlowStep) => void;
};

export default function PizzaTracker({ view, size = "full", actions }: { view: FlowView; size?: "pin" | "full" | "list"; actions?: TrackerActions }) {
  const live = view.step === "live";
  const done = view.done ?? [];
  const stateOf = (index: number) => (live || index < view.index || done.includes(FLOW_STEPS[index].key) ? "is-done" : index === view.index ? "is-now" : "");
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

  if (size === "list") {
    return (
      <div className={`cw-pizza cw-pizza-list ${view.red ? "is-red" : ""}`}>
        <ol className="cw-pizza-rows" aria-label="New account steps">
          {FLOW_STEPS.map((step, index) => {
            const state = stateOf(index);
            return (
              <li key={step.key} className={`cw-pizza-row ${state}`} aria-current={state === "is-now" ? "step" : undefined}>
                <span className="cw-pizza-mark" aria-hidden="true">
                  {state === "is-done" ? "✓" : null}
                </span>
                <span className="cw-pizza-name">{step.tracker}</span>
                {state === "is-now" ? <span className="cw-pizza-who">{view.withWho}</span> : null}
                {actions && !live && step.key !== "live" ? (
                  state === "is-done" ? (
                    <button type="button" className="ui-link cw-pizza-act" disabled={actions.busy} onClick={() => actions.onUndo(step.key)} aria-label={`Undo ${step.tracker}`}>
                      Undo
                    </button>
                  ) : actions.canMark(step.key) ? (
                    <button type="button" className="ui-link cw-pizza-act" disabled={actions.busy} onClick={() => actions.onMarkDone(step.key)} aria-label={`Mark ${step.tracker} done`}>
                      Mark done
                    </button>
                  ) : null
                ) : null}
              </li>
            );
          })}
        </ol>
        <span className="ui-visually-hidden">{summary}</span>
      </div>
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
