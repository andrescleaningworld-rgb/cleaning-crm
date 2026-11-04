"use client";

// Settings -> Pin Board -> "TV slideshow": how long the board sits idle
// before the slideshow starts, how long each picture stays up and how many
// show in one round, and the Google Drive folder whose pictures are
// mixed in with the starred photos. Owner only. GET/POST /api/board/tv-slideshow.

import { useCallback, useEffect, useState } from "react";
import { BigButton, CHEER, Card, ErrorBox, Field, friendlyDate, showToast } from "@/app/ui";
import type { TvSlideshowSettings } from "@/lib/pg/tv-slideshow";

// Same limits as SLIDE_SECONDS_RANGE / SLIDES_PER_SHOW_RANGE in lib/pg/tv-slideshow.ts (that file is server only).
const SECONDS = { min: 5, max: 60 };
const PER_ROUND = { min: 1, max: 50 };

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
  const [seconds, setSeconds] = useState("10");
  const [perRound, setPerRound] = useState("6");
  const [folder, setFolder] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "sync">("");
  const [error, setError] = useState("");
  const [syncLine, setSyncLine] = useState("");

  const show = useCallback((data: Loaded) => {
    setLoaded(data);
    setIdle(String(data.settings.idleMinutes));
    setSeconds(String(data.settings.slideSeconds));
    setPerRound(String(data.settings.slidesPerShow));
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
    const slideSeconds = Math.round(Number(seconds));
    const slidesPerShow = Math.round(Number(perRound));
    const timingReady = loaded?.settings.timingReady === true;
    if (timingReady && (!Number.isFinite(slideSeconds) || slideSeconds < SECONDS.min || slideSeconds > SECONDS.max)) {
      return setError(`Seconds per picture must be a number from ${SECONDS.min} to ${SECONDS.max}.`);
    }
    if (timingReady && (!Number.isFinite(slidesPerShow) || slidesPerShow < PER_ROUND.min || slidesPerShow > PER_ROUND.max)) {
      return setError(`Pictures per round must be a number from ${PER_ROUND.min} to ${PER_ROUND.max}.`);
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) return setError("Minutes must be a number from 1 to 60.");
    if (!folder.trim()) return setError("Paste the Google Drive folder link, or its ID.");
    setBusy("save");
    try {
      const body = await post({
        action: "save",
        idleMinutes: minutes,
        driveFolder: folder,
        driveEnabled: enabled,
        ...(timingReady ? { slideSeconds, slidesPerShow } : {}),
      });
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
  const saved =
    settings.driveEnabled === enabled &&
    settings.driveFolderId === folder.trim() &&
    String(settings.idleMinutes) === idle.trim() &&
    String(settings.slideSeconds) === seconds.trim() &&
    String(settings.slidesPerShow) === perRound.trim();
  const roundSeconds = Math.round(Number(seconds)) * Math.round(Number(perRound));

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
          label="Seconds per picture"
          hint={`How long each picture stays up. From ${SECONDS.min} to ${SECONDS.max}.`}
          type="number"
          inputMode="numeric"
          min={SECONDS.min}
          max={SECONDS.max}
          value={seconds}
          disabled={disabled || !settings.timingReady}
          onChange={(event) => setSeconds(event.target.value)}
        />
        <Field
          label="Pictures per round"
          hint={`How many pictures show before the board comes back. From ${PER_ROUND.min} to ${PER_ROUND.max}. Today's birthdays and events count as one.`}
          type="number"
          inputMode="numeric"
          min={PER_ROUND.min}
          max={PER_ROUND.max}
          value={perRound}
          disabled={disabled || !settings.timingReady}
          onChange={(event) => setPerRound(event.target.value)}
        />
        {settings.timingReady ? (
          Number.isFinite(roundSeconds) && roundSeconds > 0 ? (
            <p className="ui-muted">One round lasts about {roundSeconds >= 90 ? `${Math.round(roundSeconds / 60)} minutes` : `${roundSeconds} seconds`}, then the board comes back.</p>
          ) : null
        ) : loaded.ready ? (
          <p className="ui-savestatus">Seconds per picture and pictures per round can be changed once this database has had its update. Until then: 10 seconds, 6 pictures.</p>
        ) : null}
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
