// The gold "Ready to start" badge (the rule: isReadyToStart in
// lib/setupWizard.ts). The same words everywhere; only the size changes:
//   pin     on a pin on the board
//   tv      on a pin in TV mode: readable from across the room
//   panel   in the pin's open panel and the setup card
//   banner  at the top of the account page and the wizard's last screen

const SIZES = {
  pin: { fontSize: 14, padding: "3px 10px", border: 2 },
  tv: { fontSize: 26, padding: "6px 16px", border: 3 },
  panel: { fontSize: 18, padding: "6px 14px", border: 2 },
  banner: { fontSize: 22, padding: "8px 18px", border: 3 },
} as const;

export default function ReadyBadge({ size = "panel" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35em",
        alignSelf: "flex-start",
        background: "linear-gradient(180deg, #FFE27A 0%, #F2B705 100%)",
        color: "#3D2B00",
        border: `${s.border}px solid #B07F00`,
        borderRadius: 999,
        fontSize: s.fontSize,
        fontWeight: 900,
        lineHeight: 1.15,
        padding: s.padding,
        whiteSpace: "nowrap",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }}
    >
      <span aria-hidden="true">★</span>
      Ready to start
    </span>
  );
}
