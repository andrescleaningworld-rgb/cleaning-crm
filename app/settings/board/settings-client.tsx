"use client";

import { useCallback, useEffect, useState } from "react";
import { BigButton, CHEER, Card, ConfirmSheet, EmptyState, ErrorBox, Field, Screen, SkeletonList, friendlyDate, showToast } from "@/app/ui";
import type { BoardSettings, TvLink } from "@/lib/board";
import { postBoard } from "../../board/board-client";

type State = "loading" | "off" | "denied" | "failed" | "ready";

export default function BoardSettingsClient() {
  const [state, setState] = useState<State>("loading");
  const [days, setDays] = useState("3");
  const [links, setLinks] = useState<TvLink[]>([]);
  const [label, setLabel] = useState("Office TV");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** The new link, shown once right after it is made. */
  const [fresh, setFresh] = useState("");
  const [revoking, setRevoking] = useState<TvLink | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/board?view=settings", { cache: "no-store" });
      if (response.status === 403) return setState("denied");
      const body = (await response.json()) as { success?: boolean; ready?: boolean; settings?: BoardSettings; links?: TvLink[] };
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      setDays(String(body.settings?.oldAfterDays ?? 3));
      setLinks(body.links ?? []);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(work: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const saveDays = () =>
    run(async () => {
      const value = Math.round(Number(days));
      if (!Number.isFinite(value) || value < 1 || value > 60) throw new Error("Days must be a number from 1 to 60.");
      await postBoard({ action: "saveSettings", oldAfterDays: value });
      showToast(CHEER.logged);
    });

  const makeLink = () =>
    run(async () => {
      const data = await postBoard({ action: "createTvLink", label });
      setFresh(`${window.location.origin}/board/tv?k=${encodeURIComponent(String(data.token ?? ""))}`);
      await load();
    });

  const revoke = (link: TvLink) =>
    run(async () => {
      await postBoard({ action: "revokeTvLink", id: link.id });
      setRevoking(null);
      await load();
      showToast("That TV link is off.");
    });

  async function copyFresh() {
    try {
      await navigator.clipboard.writeText(fresh);
      showToast("Link copied.");
    } catch {
      showToast("Copy did not work. Select the link and copy it.", "bad");
    }
  }

  return (
    <Screen title="Pin Board settings" backHref="/board">
      {state === "loading" ? (
        <SkeletonList rows={2} />
      ) : state === "off" ? (
        <EmptyState title="Not turned on here yet" text="The Pin Board works once it is switched on and this database has its tables." />
      ) : state === "denied" ? (
        <EmptyState title="Only the owner can change these" text="Ask the owner to change the days or to make a TV link." />
      ) : state === "failed" ? (
        <ErrorBox title="The settings did not load." onRetry={() => void load()} />
      ) : (
        <>
          <Card title="When a paper turns yellow">
            <Field
              label="Days on the board before a paper is stuck too long"
              hint="After this many days the paper turns yellow, its corner curls and it gets a red days tag."
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={days}
              disabled={busy}
              onChange={(event) => setDays(event.target.value)}
            />
            <div style={{ marginTop: 12 }}>
              <BigButton busy={busy} busyLabel="Saving…" onClick={() => void saveDays()}>
                Save days
              </BigButton>
            </div>
          </Card>

          <Card title="Office TV links">
            <p className="ui-card-text">A TV link opens the board on the office TV without a login. It shows account names and the kind of paper only. Turn a link off if it gets out.</p>
            <div className="ui-stack" style={{ marginTop: 12 }}>
              <Field label="Name for this link" hint="Where the TV is, so you know which link is which." value={label} maxLength={60} disabled={busy} onChange={(event) => setLabel(event.target.value)} />
              <div>
                <BigButton kind="second" icon="plus" disabled={busy} onClick={() => void makeLink()}>
                  Make a TV link
                </BigButton>
              </div>

              {fresh ? (
                <div className="ui-errorbox" role="status" style={{ borderColor: "var(--ui-good)", background: "var(--ui-good-soft)" }}>
                  <p className="ui-strong">Your new TV link. It is shown only this once.</p>
                  <p className="ui-code" style={{ overflowWrap: "anywhere" }}>
                    {fresh}
                  </p>
                  <div className="ui-actions-row">
                    <BigButton onClick={() => void copyFresh()}>Copy link</BigButton>
                    <BigButton kind="second" onClick={() => setFresh("")}>
                      I saved it
                    </BigButton>
                  </div>
                </div>
              ) : null}

              {links.length === 0 ? <p className="ui-muted">No TV links yet.</p> : null}
              {links.map((link) => (
                <div key={link.id} className="ui-card-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <p className="ui-strong">{link.label || "TV link"}</p>
                    <p className="ui-muted">
                      Made {friendlyDate(link.createdAt)}
                      {link.createdBy ? ` by ${link.createdBy}` : ""}.{" "}
                      {link.revokedAt ? `Turned off ${friendlyDate(link.revokedAt)}${link.revokedBy ? ` by ${link.revokedBy}` : ""}.` : link.lastSeenAt ? `Last used ${friendlyDate(link.lastSeenAt)}.` : "Not used yet."}
                    </p>
                  </div>
                  {link.revokedAt ? null : (
                    <BigButton kind="danger" disabled={busy} onClick={() => setRevoking(link)}>
                      Turn off
                    </BigButton>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {error ? <ErrorBox title="Not saved yet." text={error} /> : null}
        </>
      )}

      <ConfirmSheet
        open={Boolean(revoking)}
        title="Turn off this TV link?"
        text="Any TV using this link stops showing the board. It cannot be turned back on; make a new link instead."
        confirmLabel="Turn off link"
        busy={busy}
        busyLabel="Turning off…"
        onConfirm={() => revoking && void revoke(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </Screen>
  );
}
