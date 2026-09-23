"use client";

// Printable Crew Link sign: the building name, a huge QR code for the
// account's Crew Link, and "Scan with your camera / Escanear con la cámara".
// Admin-only (not in proxy.ts PUBLIC_PATHS). Only the building name is
// printed — nothing else about the account. The QR code is made in the
// browser by the `qrcode` package; no outside service sees the link.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import QRCode from "qrcode";

type TemplateResponse = {
  success?: boolean;
  error?: string;
  template?: { porterCode: string; locationName: string; accountName: string } | null;
};

export default function CrewLinkPrintSignPage() {
  const params = useParams<{ accountId: string }>();
  const accountId = typeof params?.accountId === "string" ? decodeURIComponent(params.accountId) : "";
  const [placeName, setPlaceName] = useState("");
  const [url, setUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/checklist-templates?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
        const data = (await res.json()) as TemplateResponse;
        if (!res.ok || data.success === false) throw new Error(data.error || "Could not load this Crew Link.");
        if (!data.template?.porterCode) throw new Error("This account doesn't have a Crew Link yet.");
        const link = `${window.location.origin}/porter/${data.template.porterCode}`;
        const qr = await QRCode.toDataURL(link, { width: 1000, margin: 1, errorCorrectionLevel: "M" });
        if (cancelled) return;
        setPlaceName(data.template.locationName || data.template.accountName);
        setUrl(link);
        setQrDataUrl(qr);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this Crew Link.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (error) {
    return <p className="p-8 text-center text-lg font-semibold text-red-700">{error}</p>;
  }
  if (!qrDataUrl) {
    return <p className="p-8 text-center text-lg text-slate-500">Loading sign…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-[64px] items-center gap-3 rounded-2xl bg-blue-700 px-8 text-xl font-bold text-white shadow-sm hover:bg-blue-800"
        >
          <span aria-hidden="true">🖨️</span> Print
        </button>
        <p className="w-full text-center text-base text-slate-500">Tip: in the print window, choose &quot;Fit to page&quot; if it spills onto a second page.</p>
      </div>

      <div className="flex flex-col items-center gap-6 py-4 text-center text-black">
        <div className="flex items-center gap-3">
          <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={48} height={48} className="h-12 w-12 object-contain" />
          <p className="text-2xl font-bold">Crew Link</p>
        </div>
        <h1 className="text-5xl font-black leading-tight sm:text-6xl">{placeName}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR data URL made in the browser */}
        <img src={qrDataUrl} alt="QR code for the Crew Link" className="w-full max-w-[5.5in]" />
        <div className="space-y-1">
          <p className="text-4xl font-black">📷 Scan with your camera</p>
          <p className="text-4xl font-black">Escanear con la cámara</p>
        </div>
        <p className="break-all text-base text-slate-600">{url}</p>
      </div>
    </div>
  );
}
