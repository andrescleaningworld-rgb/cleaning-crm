"use client";

// Print PDF on an account: print it, pin the account to the board, or both.
// The paper on the board carries the account (its name opens the account) and
// an "Open PDF" button that makes the Admin (office) PDF fresh when tapped
// (lib/pg/board.ts paperPdfHref), so no file is stored. Pinning uses the
// board's own "Pin to board" (pinRecord); a manager is texted only when it
// lands in their square (lib/pg/board-sms.ts). These pins are marked
// from: "printPdf", and that is what lets them go up even when Settings ->
// Pin Board -> Accounts is off.
import { useState } from "react";
import { BigButton, Sheet, showToast } from "@/app/ui";
import { SquareTiles, pinRecord, type BoardSpot } from "@/app/components/pin-to-board";
import type { PinInfo } from "@/lib/boardPins";

type Step = "choose" | "square";

export default function PrintOrPinSheet({
  open,
  info,
  account,
  onClose,
  onPrint,
  onPinned,
}: {
  open: boolean;
  info: PinInfo;
  account: { id: string; name: string };
  onClose: () => void;
  /** Opens the usual Print PDF choice (Team Leader or Admin). */
  onPrint: () => void;
  onPinned: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [thenPrint, setThenPrint] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  function close() {
    if (busyKey) return;
    setStep("choose");
    setError("");
    onClose();
  }

  function pickSquare(both: boolean) {
    setThenPrint(both);
    setError("");
    setStep("square");
  }

  async function pin(spot: BoardSpot) {
    setError("");
    setBusyKey(spot.key);
    try {
      await pinRecord({ type: "account", recordId: account.id, title: account.name, accountId: account.id, accountName: account.name, square: spot.square, box: spot.box, forWho: spot.label, from: "printPdf" });
      showToast(`Pinned to ${spot.label} ✓`);
      onPinned();
      setStep("choose");
      onClose();
      if (thenPrint) onPrint();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It was not pinned. Try again.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <Sheet
      open={open}
      title={step === "choose" ? "Print PDF" : thenPrint ? "Pin to board, then print" : "Pin to board"}
      text={step === "choose" ? `${account.name}. Print it, put it on the board for the office, or both.` : `${account.name}. Tap the square it goes in.`}
      onClose={close}
      busy={Boolean(busyKey)}
    >
      {step === "choose" ? (
        <div className="ui-stack" data-print-or-pin>
          <BigButton
            onClick={() => {
              close();
              onPrint();
            }}
          >
            🖨 Print PDF
          </BigButton>
          <BigButton kind="second" onClick={() => pickSquare(false)}>
            📌 Pin to board
          </BigButton>
          <BigButton kind="second" onClick={() => pickSquare(true)}>
            Both
          </BigButton>
        </div>
      ) : (
        <div className="ui-stack">
          <SquareTiles info={info} onPick={(spot) => void pin(spot)} disabled={Boolean(busyKey)} busyKey={busyKey} />
          {error ? <p className="ui-field-error">{error}</p> : null}
          <BigButton kind="quiet" disabled={Boolean(busyKey)} onClick={() => setStep("choose")}>
            Back
          </BigButton>
        </div>
      )}
    </Sheet>
  );
}
