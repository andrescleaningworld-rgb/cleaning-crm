"use client";

// Crew Link sharing for admins/office staff: three big buttons.
// - Text the link: on a phone, opens the phone's own Messages app with a
//   short bilingual message and the link filled in (sms: link — no server
//   SMS, so it doesn't depend on Textbelt). On a computer (sms: links do
//   nothing on Windows), shows a big QR code to scan with a phone instead.
// - Copy link.
// - Print QR sign: opens a printable page (admin-only route) with the
//   building name and a huge QR code.
// The QR code is made in the browser by the `qrcode` package — no outside
// service ever sees the link.
import { useEffect, useState } from "react";
import QRCode from "qrcode";

function isPhoneOrTablet(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
}

export function crewLinkTextMessage(placeName: string, url: string): string {
  return `Crew Link — ${placeName}\nOpen this on your phone / Ábrelo en tu teléfono:\n${url}`;
}

export default function CrewLinkShare({ accountId, placeName, url }: { accountId: string; placeName: string; url: string }) {
  const [isPhone, setIsPhone] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only capability check
    setIsPhone(isPhoneOrTablet());
  }, []);

  useEffect(() => {
    if (!showQr || !url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [showQr, url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  // "sms:?&body=" opens the Messages app with the text filled in on both
  // iPhone and Android, with no phone number (the user picks the contact).
  const smsHref = `sms:?&body=${encodeURIComponent(crewLinkTextMessage(placeName, url))}`;
  const buttonClass =
    "flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl px-4 text-lg font-bold shadow-sm disabled:opacity-50";

  if (!url) return null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {isPhone ? (
          <a href={smsHref} className={`${buttonClass} bg-green-600 text-white hover:bg-green-500`}>
            <span className="text-2xl" aria-hidden="true">💬</span> Text the link
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setShowQr((prev) => !prev)}
            aria-expanded={showQr}
            className={`${buttonClass} bg-green-600 text-white hover:bg-green-500`}
          >
            <span className="text-2xl" aria-hidden="true">💬</span> Text the link
          </button>
        )}
        <button type="button" onClick={copyLink} className={`${buttonClass} bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50`}>
          <span className="text-2xl" aria-hidden="true">{copied ? "✅" : "📋"}</span> {copied ? "Copied!" : "Copy link"}
        </button>
        <a
          href={`/crew-link/print/${encodeURIComponent(accountId)}`}
          target="_blank"
          rel="noopener"
          className={`${buttonClass} bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50`}
        >
          <span className="text-2xl" aria-hidden="true">🖨️</span> Print QR sign
        </a>
      </div>

      {showQr && !isPhone ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
          <p className="text-lg font-bold text-green-900">Scan this with your phone&apos;s camera</p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR data URL made in the browser
            <img src={qrDataUrl} alt="QR code for the Crew Link" className="h-64 w-64 rounded-xl bg-white p-2" />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-white text-slate-400">…</div>
          )}
          <p className="max-w-sm text-base text-green-900">
            The link opens on your phone. From there, tap Share and send it to your crew by text.
          </p>
        </div>
      ) : null}
    </div>
  );
}
