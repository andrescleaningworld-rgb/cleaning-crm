"use client";

// Settings -> Pin Board, owner only: "Send me a test push". Sends one push
// to the devices tagged with the owner's own Staff ID at login, the same way
// the Pin Board status asks and the To-Do pushes go out (lib/push.ts), and
// says what OneSignal answered.

import { useState } from "react";
import { BigButton, Card } from "@/app/ui";
import { postBoard } from "../../board/board-client";

type Result = { delivered: boolean; reason: string };

export default function TestPushCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await postBoard({ action: "testPush" });
      setResult({ delivered: data.delivered === true, reason: typeof data.reason === "string" ? data.reason : "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "It did not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Push notifications">
      <p className="ui-card-text">
        Sends a test push to your own phone or computer, the same way the board asks for a status. It only arrives on a device where you logged in and allowed notifications. On an iPhone, the app has to be added to the Home Screen first.
      </p>
      <div className="ui-stack" style={{ marginTop: 12 }}>
        <div>
          <BigButton kind="second" busy={busy} busyLabel="Sending…" onClick={() => void send()} data-test-push>
            Send me a test push
          </BigButton>
        </div>
        {result ? (
          result.delivered ? (
            <p className="ui-savestatus" role="status">
              OneSignal took it ✓ {result.reason ? result.reason : "It should show on your device within a minute. If it does not, allow notifications for this site and log in again on that device."}
            </p>
          ) : (
            <p className="ui-field-error" role="status">
              Not delivered. {result.reason || "OneSignal gave no reason."}
            </p>
          )
        ) : null}
        {error ? <p className="ui-field-error">{error}</p> : null}
      </div>
    </Card>
  );
}
