"use client";

// Settings -> Pin Board -> "TV slideshow": how long the board sits idle
// before the slideshow starts, and the Google Drive folder whose pictures are
// mixed in with the starred photos. Owner only. GET/POST /api/board/tv-slideshow.

import { useCallback, useEffect, useState } from "react";
import { BigButton, CHEER, Card, ErrorBox, Field, friendlyDate, showToast } from "@/app/ui";
import type { TvSlideshowSettings } from "@/lib/pg/tv-slideshow";

type Loaded = { ready: boolean; settings: TvSlideshowSettings; serviceAccount: string };
type SyncResult = { ran: boolean; reason?: string; copied: number; removed: number; skipped: number; left: number; error: string };

function timeOf(value: string): string {
  if (!value) return "";
  const at = new Date(value);
  return `${friendlyDate(value)} at ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}`;
}

function syncWords(result: SyncResult): string {
  if (!result.ran) return result.reason === "off" ? "Turn on the switch and save first." : result.reason === "already running" ? "A copy is already running. Check back in a few minutes." : "Not ready yet.";
  if (result.error) return result.error;
  const parts = [`${result.copied} new`, result.removed ? `${result.removed} removed` : "", result.skipped ? `${result.skipped} could not be opened` : ""].filter(Boolean);
  return `Done: ${parts.join(", ")}.${result.left ? ` ${result.left} more will be copied in the next hour.` : ""}`;
}

export default function TvSlideshowCard() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [idle, setIdle] = useState("5");
  const [folder, setFolder] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "sync">("");
  const [error, setError] = useState("");
  const [syncLine, setSyncLine] = useState("");

  const show = useCallback((data: Loaded) => {
    setLoaded(data);
    setIdle(String(data.settings.idleMinutes));
    setFolder(data.settings.driveFolderId);
    setEnabled(data.settings.driveEnabled);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/board/tv-slideshow", { cache: "no-store" });
      const body = (await response.json()) as Partial<Loaded> & { success?: boolean };
      if (!response.ok || body.success !== true || !body.settings) throw new Error("failed");
      show({ ready: body.ready === true, settings: body.settings, serviceAccount: body.serviceAccount ?? "" });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [show]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/board/tv-slideshow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; settings?: TvSlideshowSettings; result?: SyncResult };
    if (!response.ok || body.success !== true) throw new Error(body.error ?? "That did not save. Try again.");
    return body;
  }

  async function save() {
    setError("");
    const minutes = Math.round(Number(idle));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) return setError("Minutes must be a number from 1 to 60.");
    if (!folder.trim()) return setError("Paste the Google Drive folder link, or its ID.");
    setBusy("save");
    try {
      const body = await post({ action: "save", idleMinutes: minutes, driveFolder: folder, driveEnabled: enabled });
      if (body.settings && loaded) show({ ...loaded, settings: body.settings });
      showToast(CHEER.logged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function syncNow() {
    setError("");
    setSyncLine("");
    setBusy("sync");
    try {
      const body = await post({ action: "syncNow" });
      if (body.settings && loaded) show({ ...loaded, settings: body.settings });
      if (body.result) setSyncLine(syncWords(body.result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The copy did not run. Try again.");
    } finally {
      setBusy("");
    }
  }

  if (failed) return <ErrorBox title="The TV slideshow settings did not load." onRetry={() => void load()} />;
  if (!loaded) return null;

  const settings = loaded.settings;
  const disabled = busy !== "" || !loaded.ready;
  const saved = settings.driveEnabled === enabled && settings.driveFolderId === folder.trim() && String(settings.idleMinutes) === idle.trim();

  return (
    <Card title="TV slideshow">
      <p className="ui-card-text">
        The TV shows the board. When nobody has pressed the remote, clicked or touched it for this long, it shows the pictures: starred photos and the Google Drive folder below, mixed. Any press goes straight back to the board.
      </p>
      {!loaded.ready ? <p className="ui-savestatus">These can be changed once this database has had its update. Until then: 5 minutes, starred photos only.</p> : null}
      <div className="ui-stack" style={{ marginTop: 12 }}>
        <Field
          label="Minutes before the slideshow starts"
          hint="From 1 to 60. The time starts over after every press."
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={idle}
          disabled={disabled}
          onChange={(event) => setIdle(event.target.value)}
        />
        <Field
          label="Google Drive slideshow folder"
          hint={`The folder link or its ID. Share the folder with ${loaded.serviceAccount || "the app's Google account"} as Viewer. The app only reads it: nothing in Drive is ever changed.`}
          value={folder}
          disabled={disabled}
          onChange={(event) => setFolder(event.target.value)}
        />
        <label className="ui-check">
          <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>Show pictures from this folder on the TV</span>
        </label>
        <div>
          <BigButton busy={busy === "save"} busyLabel="Saving…" disabled={disabled} onClick={() => void save()}>
            Save TV slideshow
          </BigButton>
        </div>

        <p className="ui-strong" data-tv-drive-status>
          {settings.pictureCount} {settings.pictureCount === 1 ? "picture" : "pictures"}
          {settings.lastSyncedAt ? `, last synced ${timeOf(settings.lastSyncedAt)}` : ", not synced yet"}
          {settings.driveEnabled ? "" : " (switch is off)"}
        </p>
        {settings.lastError ? <p className="ui-field-error">Last copy: {settings.lastError}</p> : null}
        <p className="ui-muted">New pictures are copied every hour. Pictures taken out of the folder leave the TV at the next copy.</p>
        <div>
          <BigButton kind="second" busy={busy === "sync"} busyLabel="Copying pictures…" disabled={disabled || !settings.driveEnabled || !saved} onClick={() => void syncNow()}>
            Sync now
          </BigButton>
        </div>
        {!saved && loaded.ready ? <p className="ui-muted">Save first, then Sync now.</p> : null}
        {syncLine ? <p className="ui-muted" role="status">{syncLine}</p> : null}
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Card>
  );
}
