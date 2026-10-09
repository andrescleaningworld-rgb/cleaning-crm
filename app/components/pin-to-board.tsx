"use client";

// "Pin to board" on a record's own screen: the switch a form shows and the
// button an existing record shows. Both appear only for the kinds of record
// switched on in Settings -> Pin Board. Where the Pin Board is not turned on
// (or its data does not load), they are simply not there.
//
// Pinning never changes the record: it puts up a paper that points at it.

import { useCallback, useEffect, useState } from "react";
import { BigButton, SelectField, Sheet, showToast } from "@/app/ui";
import { OFFICE_LABEL, OFFICE_SQUARE, squareForManager, type PinInfo, type PinRequest, type PinType } from "@/lib/boardPins";

/** What is switched on, the squares, and what is pinned now. null = the Pin Board is not turned on here (or did not answer). */
async function fetchPinInfo(): Promise<PinInfo | null> {
  try {
    const response = await fetch("/api/board?view=pin", { cache: "no-store" });
    const body = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<PinInfo>;
    if (!response.ok || body.success !== true || body.ready !== true || !body.types) return null;
    return { types: body.types, managers: body.managers ?? [], pinned: body.pinned ?? {} };
  } catch {
    return null;
  }
}

/** One load per screen; pass `info` down to every switch and button on it. */
export function usePinInfo(): { info: PinInfo | null; reload: () => Promise<void> } {
  const [info, setInfo] = useState<PinInfo | null>(null);
  const reload = useCallback(async () => setInfo(await fetchPinInfo()), []);
  useEffect(() => {
    let cancelled = false;
    void fetchPinInfo().then((loaded) => {
      if (!cancelled) setInfo(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { info, reload };
}

export const pinIsOn = (info: PinInfo | null, type: PinType) => info?.types[type]?.show === true;

export async function pinRecord(request: PinRequest): Promise<void> {
  const response = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pinRecord", ...request }) });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || body.success !== true) throw new Error(body.error ?? "It was not pinned. Try again.");
}

/** What a form remembers about its "Pin to board" switch. */
export type PinChoice = { on: boolean; square: string };

/** How the switch starts: "Pinned by default" from Settings, in the square of the record's manager (Office when that manager has none). */
export function startingPin(info: PinInfo | null, type: PinType, managerName = ""): PinChoice {
  return { on: info?.types[type]?.pinned === true, square: info ? squareForManager(info.managers, managerName) : OFFICE_SQUARE };
}

function SquarePicker({ info, value, onChange, disabled }: { info: PinInfo; value: string; onChange: (square: string) => void; disabled?: boolean }) {
  return (
    <SelectField label="Whose square" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value={OFFICE_SQUARE}>{OFFICE_LABEL}</option>
      {info.managers.map((manager) => (
        <option key={manager.id} value={manager.id}>
          {manager.name}
        </option>
      ))}
    </SelectField>
  );
}

/** The switch on a form. Renders nothing when this kind of record does not offer "Pin to board". */
export function PinSwitch({ info, type, value, onChange, disabled }: { info: PinInfo | null; type: PinType; value: PinChoice; onChange: (value: PinChoice) => void; disabled?: boolean }) {
  if (!info || !pinIsOn(info, type)) return null;
  return (
    <div className="ui-stack" data-pin-to-board={type}>
      <label className="ui-check">
        <input type="checkbox" checked={value.on} disabled={disabled} onChange={(event) => onChange({ ...value, on: event.target.checked })} />
        <span>Pin to board</span>
      </label>
      {value.on ? <SquarePicker info={info} value={value.square} disabled={disabled} onChange={(square) => onChange({ ...value, square })} /> : null}
    </div>
  );
}

/**
 * After a form saved its record: pins it when the switch was on. A pin that
 * fails never undoes the save; the person is told so they can use the button.
 */
export async function pinAfterSave(info: PinInfo | null, type: PinType, choice: PinChoice, record: Omit<PinRequest, "type" | "square">): Promise<void> {
  if (!info || !pinIsOn(info, type) || !choice.on || !record.recordId) return;
  try {
    await pinRecord({ type, square: choice.square, ...record });
  } catch {
    showToast("Saved, but it was not pinned to the board. Use Pin to board on the record.", "bad");
  }
}

/** The button on an existing record. Says "On the board" once it is pinned. Renders nothing when this kind does not offer it. */
export function PinButton({
  info,
  type,
  record,
  managerName = "",
  onPinned,
}: {
  info: PinInfo | null;
  type: PinType;
  record: Omit<PinRequest, "type" | "square">;
  /** The record's manager: the square it goes to unless another is picked. */
  managerName?: string;
  onPinned?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [square, setSquare] = useState(OFFICE_SQUARE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justPinned, setJustPinned] = useState(false);
  if (!info || !pinIsOn(info, type) || !record.recordId) return null;
  if (justPinned || info.pinned[type]?.includes(record.recordId)) {
    return (
      <span className="ui-pill ui-pill-done" data-pin-to-board={type}>
        On the board
      </span>
    );
  }

  async function pin() {
    setError("");
    setBusy(true);
    try {
      await pinRecord({ type, square, ...record });
      setJustPinned(true);
      setOpen(false);
      showToast("Pinned to the board.");
      onPinned?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It was not pinned. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BigButton
        kind="second"
        data-pin-to-board={type}
        onClick={() => {
          setSquare(squareForManager(info.managers, managerName));
          setError("");
          setOpen(true);
        }}
      >
        Pin to board
      </BigButton>
      <Sheet
        open={open}
        title="Pin to board"
        text={record.title}
        onClose={() => setOpen(false)}
        busy={busy}
        actions={
          <BigButton busy={busy} busyLabel="Pinning…" onClick={() => void pin()}>
            Pin it
          </BigButton>
        }
      >
        <div className="ui-stack">
          <SquarePicker info={info} value={square} disabled={busy} onChange={setSquare} />
          {error ? <p className="ui-field-error">{error}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
