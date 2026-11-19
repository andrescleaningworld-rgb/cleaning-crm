// The Textbelt credit warning on the Pin Board and its TV: red when credit is 0
// (no texts go out), amber when it is under 50. Nothing when it is fine or not
// known yet. The number is the one Textbelt gave after the last text
// (lib/pg/sms-credit.ts).

import type { SmsCredit } from "@/lib/pg/sms-credit";

export default function SmsCreditBanner({ credit, tv = false }: { credit: SmsCredit | null | undefined; tv?: boolean }) {
  if (!credit || credit.level === "ok") return null;
  const zero = credit.level === "zero";
  return (
    <div
      role="alert"
      data-sms-credit={credit.level}
      style={{
        background: zero ? "#b91c1c" : "#fef3c7",
        color: zero ? "#ffffff" : "#78350f",
        border: zero ? "none" : "1px solid #f59e0b",
        borderRadius: 12,
        padding: tv ? "10px 18px" : "10px 14px",
        margin: "8px 0",
        fontWeight: 800,
        fontSize: tv ? 26 : 16,
        textAlign: "center",
      }}
    >
      {zero ? "Texts are OFF — Textbelt credit is 0" : `Textbelt credit low: ${credit.quota} left`}
      {!tv ? <span style={{ fontWeight: 400 }}>{zero ? " · Buy more on textbelt.com. Emails still go out." : " · Buy more on textbelt.com."}</span> : null}
    </div>
  );
}
