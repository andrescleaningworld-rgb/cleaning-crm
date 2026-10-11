"use client";

// Settings -> Team -> Connected TVs: every TV that shows the board, by name,
// with "Disconnect TV". Owner only. A TV is connected from the board's
// "Show on TV" button.

import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, ConfirmSheet, friendlyDate, showToast } from "@/app/ui";
import type { TvLink } from "@/lib/board";
import { postBoard } from "../../board/board-client";

export default function ConnectedTvs() {
  const [links, setLinks] = useState<TvLink[] | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TvLink | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/board?view=settings", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean; links?: TvLink[] };
      if (!response.ok || body.success !== true) throw new Error("failed");
      // The Pin Board is off here: there are no TVs to show.
      if (body.ready !== true) return setLinks(null);
      setLinks((body.links ?? []).filter((link) => !link.revokedAt));
      setProblem("");
    } catch {
      setProblem("The TV list did not load. Pull down to try again.");
    }
  }, []);

  useEffect(() => {
    // The first load: fetches, then sets state when the answer arrives.
    void load();
  }, [load]);

  async function disconnect(link: TvLink) {
    setBusy(true);
    try {
      await postBoard({ action: "revokeTvLink", id: link.id });
      setRemoving(null);
      showToast(`${link.label || "That TV"} is disconnected.`);
      await load();
    } catch (err) {
      setRemoving(null);
      setProblem(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (links === null && !problem) return null;

  return (
    <Card title="Connected TVs">
      <p className="ui-card-text">TVs that show the board. To add one, open the Board and tap Show on TV.</p>
      <div className="ui-stack" style={{ marginTop: 12 }} data-connected-tvs>
        {problem ? <p className="ui-field-error">{problem}</p> : null}
        {links && links.length === 0 ? <p className="ui-muted">No TV is connected.</p> : null}
        {(links ?? []).map((link) => (
          <div key={link.id} className="ui-card-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <p className="ui-strong">{link.label || "TV"}</p>
              <p className="ui-muted">
                Connected {friendlyDate(link.createdAt)}
                {link.createdBy ? ` by ${link.createdBy}` : ""}. {link.lastSeenAt ? `Last showed the board ${friendlyDate(link.lastSeenAt)}.` : "Has not shown the board yet."}
              </p>
            </div>
            <BigButton kind="danger" disabled={busy} onClick={() => setRemoving(link)}>
              Disconnect TV
            </BigButton>
          </div>
        ))}
      </div>

      <ConfirmSheet
        open={Boolean(removing)}
        title={`Disconnect ${removing?.label || "this TV"}?`}
        text="That TV stops showing the board within a minute and goes back to showing a code. You can connect it again any time."
        confirmLabel="Disconnect TV"
        busy={busy}
        busyLabel="Disconnecting…"
        onConfirm={() => removing && void disconnect(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}
