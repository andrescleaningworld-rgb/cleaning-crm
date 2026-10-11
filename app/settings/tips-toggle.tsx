"use client";

// Settings -> Tips: "Don't show tips". For the person logged in, on every
// device (see app/ui/tips-store.ts). The "?" at the top of a screen still
// shows that screen's tips when asked.

import { useEffect, useState } from "react";
import { loadTips, setTipsOff, tipsAreOff } from "@/app/ui/tips-store";

export default function TipsToggle() {
  const [off, setOff] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadTips().then(() => alive && setOff(tipsAreOff()));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="ui-card" data-tips-setting style={{ marginTop: 16 }}>
      <h2 className="ui-card-title">Tips</h2>
      <label className="ui-check">
        <input
          type="checkbox"
          checked={off}
          onChange={(event) => {
            setTipsOff(event.target.checked);
            setOff(event.target.checked);
            setSaved(true);
          }}
        />
        <span>Don&apos;t show tips</span>
      </label>
      <p className="ui-muted">The pop-up tips on each screen. With this ticked they never show by themselves. The &quot;?&quot; at the top of a screen still shows them when you tap it.</p>
      <p className={`ui-savestatus ${saved ? "ui-savestatus-saved" : ""}`} role="status" aria-live="polite">
        {saved ? "Saved ✓" : ""}
      </p>
    </div>
  );
}
