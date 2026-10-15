"use client";

// A big − value + control for a number that moves in steps: time on site
// (15 minutes), a start time (30 minutes), crews (1).
//
//   <PlusMinus value={90} step={15} min={15} max={720} onChange={setMinutes} label="Time on site" format={formatMinutes} />

export default function PlusMinus({
  value,
  onChange,
  step,
  min,
  max,
  label,
  format = String,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  label: string;
  format?: (value: number) => string;
  disabled?: boolean;
}) {
  const button =
    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-3xl font-black text-slate-900 active:bg-slate-300 disabled:opacity-40";
  return (
    <span className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={button} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={`${label}: less`}>
        −
      </button>
      <span className="min-w-[6ch] text-center text-2xl font-black" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" className={button} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={`${label}: more`}>
        +
      </button>
    </span>
  );
}
