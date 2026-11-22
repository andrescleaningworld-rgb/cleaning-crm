// The switches for anything subs or customers will see (docs/unification-plan.md).
// Set in Vercel: FEATURE_<NAME>=1 turns it on, =0 turns it off. Not set: OFF on
// Production, ON in local dev and on previews (the practice database), the same
// rule as FEATURE_PIN_BOARD. A change applies on the next deploy. Server only.

export const ROLLOUT_SWITCHES = {
  /** 4A: complaint texts in the sub's own language, and an automatic email for each new CW Now task. */
  SUB_NOTICES: "FEATURE_SUB_NOTICES",
  /** 4B: "My to-dos" in the Sub Portal, tasks on the sub's calendar, due-date colors on the task link, and print. */
  MY_TODOS: "FEATURE_MY_TODOS",
} as const;

export type RolloutSwitch = keyof typeof ROLLOUT_SWITCHES;

export function rolloutOn(name: RolloutSwitch): boolean {
  const flag = (process.env[ROLLOUT_SWITCHES[name]] ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}
