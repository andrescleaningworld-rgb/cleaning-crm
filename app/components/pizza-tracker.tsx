// The pizza tracker. Made for the New Account flow (Packet > Sub picked > Sub
// OK > Customer called > Site survey > Walkthrough > Start date > First-clean
// follow-up > Live) and shared by the complaint tracker (Received > Sent to
// team > Team on it > Ready to review > Fixed; lib/complaintSteps.ts), which
// passes its own `steps`. Finished steps are filled in green, the current one
// in blue (red when it has had no progress for 2 business days), with who it
// is with.
//   size "pin"   a thin bar and one line, for a paper on the board and the TV
//   size "full"  every step named, for the account page
//   size "list"  one stage per line (check, big dot, gray), for an opened paper on the board
//                and the account page. With `actions` (the account page), a done step has a
//                small "Undo" and a step still to do has a small "Mark done".
// A step done ahead of the current one (e.g. the sub was already on the account) is green too.
// The last step is the finish line ("Live", "Fixed"): reaching it means every step is done.
// The New Account rules are in lib/accountFlow.ts.

import { FLOW_STEPS, type FlowStep } from "@/lib/accountFlow";

export type TrackerActions = {
  busy: boolean;
  /** Whether this not-done step gets the small "Mark done" (the current step's big button may already be it). */
  canMark: (step: FlowStep) => boolean;
  onMarkDone: (step: FlowStep) => void;
  onUndo: (step: FlowStep) => void;
};

/** What the tracker draws: the New Account FlowView fits it, and so does a complaint's. */
export type TrackerView = {
  step: string;
  /** 0-based; steps.length - 1 = the finish line. */
  index: number;
  /** The one line on a pin: "Ready to review - with Andrés". */
  now: string;
  /** "with Greg", "" at the finish line (or when nobody should be named). */
  withWho: string;
  red: boolean;
  /** Steps done ahead of the current one, by key. */
  done?: string[];
  /** When each step was reached (ISO), "" when not known. Shown in the list when `formatWhen` is given. */
  at?: string[];
};

export type TrackerStep = { key: string; tracker: string };

export default function PizzaTracker({
  view,
  size = "full",
  actions,
  steps = FLOW_STEPS,
  label = "New account steps",
  finish = "Live",
  formatWhen,
}: {
  view: TrackerView;
  size?: "pin" | "full" | "list";
  actions?: TrackerActions;
  steps?: TrackerStep[];
  /** Read out for the list of steps. */
  label?: string;
  /** The finish line's word, after a check: "✓ Live", "✓ Fixed". */
  finish?: string;
  /** Shows when each done / current step was reached (list size only). */
  formatWhen?: (iso: string) => string;
}) {
  const last = steps.length - 1;
  const finished = view.index >= last;
  const done = view.done ?? [];
  const stateOf = (index: number) => (finished || index < view.index || done.includes(steps[index].key) ? "is-done" : index === view.index ? "is-now" : "");
  const summary = finished ? `${finish}: every step is done.` : `Step ${view.index + 1} of ${last}: ${view.now}.${view.red ? " No progress for 2 work days." : ""}`;

  if (size === "pin") {
    return (
      <span className={`cw-pizza cw-pizza-pin ${view.red ? "is-red" : ""}`}>
        <span className="cw-pizza-bar" aria-hidden="true">
          {steps.map((step, index) => (
            <span key={step.key} className={`cw-pizza-seg ${stateOf(index)}`} />
          ))}
        </span>
        <span className="cw-pizza-now">{finished ? `✓ ${finish}` : view.now}</span>
        <span className="ui-visually-hidden">{summary}</span>
      </span>
    );
  }

  if (size === "list") {
    return (
      <div className={`cw-pizza cw-pizza-list ${view.red ? "is-red" : ""}`}>
        <ol className="cw-pizza-rows" aria-label={label}>
          {steps.map((step, index) => {
            const state = stateOf(index);
            const when = formatWhen && state && view.at?.[index] ? formatWhen(view.at[index]) : "";
            return (
              <li key={step.key} className={`cw-pizza-row ${state}`} aria-current={state === "is-now" ? "step" : undefined}>
                <span className="cw-pizza-mark" aria-hidden="true">
                  {state === "is-done" ? "✓" : null}
                </span>
                <span className="cw-pizza-name">{step.tracker}</span>
                {state === "is-now" && view.withWho ? <span className="cw-pizza-who">{view.withWho}</span> : null}
                {when ? (
                  <span className="cw-pizza-when" suppressHydrationWarning>
                    {when}
                  </span>
                ) : null}
                {actions && !finished && index !== last ? (
                  state === "is-done" ? (
                    <button type="button" className="ui-link cw-pizza-act" disabled={actions.busy} onClick={() => actions.onUndo(step.key as FlowStep)} aria-label={`Undo ${step.tracker}`}>
                      Undo
                    </button>
                  ) : actions.canMark(step.key as FlowStep) ? (
                    <button type="button" className="ui-link cw-pizza-act" disabled={actions.busy} onClick={() => actions.onMarkDone(step.key as FlowStep)} aria-label={`Mark ${step.tracker} done`}>
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
      <ol className="cw-pizza-steps" aria-label={label}>
        {steps.map((step, index) => (
          <li key={step.key} className={`cw-pizza-step ${stateOf(index)}`} aria-current={index === view.index && !finished ? "step" : undefined}>
            <span className="cw-pizza-seg" aria-hidden="true" />
            <span className="cw-pizza-label">{step.tracker}</span>
          </li>
        ))}
      </ol>
      <p className="cw-pizza-now">{finished ? `✓ ${finish}` : view.now}</p>
      <span className="ui-visually-hidden">{summary}</span>
    </div>
  );
}
