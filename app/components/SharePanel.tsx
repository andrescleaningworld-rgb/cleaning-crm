"use client";

// Shared "share this link" modal: large QR code (generated in the browser by
// the `qrcode` package — no external service sees the link), the link with
// Copy, optional "Copy message", and the device share sheet on phones/
// tablets. No sms: links (they do nothing on Windows). Used by Crew Link
// (ChecklistTemplateEditor) and Equipment Check ("Set up a tablet"); callers
// add their own extras (steps, email link, new link) as children.
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";

function useFlash(): [string, (label: string) => void] {
  const [flash, setFlash] = useState("");
  return [
    flash,
    (label: string) => {
      setFlash(label);
      window.setTimeout(() => setFlash(""), 2000);
    },
  ];
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this:", text);
    return false;
  }
}

function isTouchDevice(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
}

export default function SharePanel({
  title,
  url,
  message,
  onClose,
  children,
}: {
  title: string;
  url: string;
  // Full text for "Copy message" / the share sheet; omit to hide both.
  message?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [flash, setFlash] = useFlash();
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only capability check
    setCanShare(isTouchDevice() && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function share() {
    try {
      await navigator.share({ title, text: message ?? url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (await copyText(message ?? url)) setFlash("message");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL generated in the browser
            <img src={qrDataUrl} alt="QR code of the link" className="h-72 w-72 rounded-lg border border-gray-200" />
          ) : (
            <div className="flex h-72 w-72 items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-500">Loading…</div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800" />
          <button
            type="button"
            onClick={async () => {
              if (await copyText(url)) setFlash("link");
            }}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            {flash === "link" ? "Copied!" : "Copy"}
          </button>
        </div>

        {message && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                if (await copyText(message)) setFlash("message");
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {flash === "message" ? "Message copied!" : "Copy message"}
            </button>
            {canShare && (
              <button type="button" onClick={share} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Share…
              </button>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
