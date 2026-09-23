"use client";

// Big 4-digit PIN keypad (dots + 3x4 grid) shared by the Team Hub crew
// sign-in (app/team-hub/[token]/page.tsx) and the Equipment Check tablet
// app (app/equipment-check/[key]/page.tsx). Display + taps only — each
// caller owns the PIN state and what happens on submit.
export default function PinKeypad({
  pinLength,
  disabled,
  onDigit,
  onBackspace,
  onSubmit,
}: {
  pinLength: number;
  disabled: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="mt-4 flex justify-center gap-3">
        {Array.from({ length: Math.max(4, pinLength) }).map((_, i) => (
          <span key={i} className={`h-5 w-5 rounded-full ${i < pinLength ? "bg-blue-700" : "bg-gray-200"}`} />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => onDigit(digit)}
            disabled={disabled}
            className="min-h-[72px] rounded-2xl bg-gray-100 text-2xl font-bold text-slate-800 active:bg-gray-200 disabled:opacity-60"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => (pinLength >= 4 ? onSubmit() : undefined)}
          disabled={disabled || pinLength < 4}
          className="min-h-[72px] rounded-2xl bg-blue-700 text-lg font-bold text-white disabled:opacity-40"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => onDigit("0")}
          disabled={disabled}
          className="min-h-[72px] rounded-2xl bg-gray-100 text-2xl font-bold text-slate-800 active:bg-gray-200 disabled:opacity-60"
        >
          0
        </button>
        <button
          type="button"
          onClick={onBackspace}
          disabled={disabled}
          className="min-h-[72px] rounded-2xl bg-gray-100 text-lg font-bold text-slate-800 active:bg-gray-200 disabled:opacity-60"
        >
          ⌫
        </button>
      </div>
    </>
  );
}
