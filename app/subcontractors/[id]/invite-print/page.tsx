"use client";

// Printable sub portal invite: a big QR code for the portal, the sub's login
// email, and the how-to lines in English, Spanish and Portuguese
// (lib/subPortalInvite.ts). Admin only (not in proxy.ts's public paths).
// Same print shell as the Crew Link sheets. The QR code is made in the
// browser by the `qrcode` package; no outside service sees the link.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import QRCode from "qrcode";
import { CrewPrintStyles, PrintButton } from "@/app/crew-link/print/CrewPrintSheet";
import { INVITE_LANGUAGES, SUB_PORTAL_PATH } from "@/lib/subPortalInvite";

export default function SubInvitePrintPage() {
  const params = useParams<{ id: string }>();
  const subId = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!subId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/subcontractors/${encodeURIComponent(subId)}/invite`, { cache: "no-store" });
        const data = (await response.json()) as { success?: boolean; error?: string; email?: string; name?: string };
        if (!response.ok || !data.success) throw new Error(data.error || "Could not load this sub.");
        if (!data.email) throw new Error("Add an email for this sub first.");
        const link = `${window.location.origin}${SUB_PORTAL_PATH}`;
        const qr = await QRCode.toDataURL(link, { width: 800, margin: 1, errorCorrectionLevel: "M" });
        if (cancelled) return;
        setEmail(data.email);
        setName(data.name ?? "");
        setUrl(link);
        setQrDataUrl(qr);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this sub.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subId]);

  if (error) return <p className="p-8 text-center text-lg font-semibold text-red-700">{error}</p>;
  if (!qrDataUrl) return <p className="p-8 text-center text-lg text-slate-500">Loading invite…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <PrintButton />
      {/* Opt in to printing — globals.css hides everything else on paper. */}
      <CrewPrintStyles />
      <div className="crew-print-view flex flex-col items-center gap-4 py-4 text-center text-black">
        <div className="flex items-center gap-3">
          <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={48} height={48} className="h-12 w-12 object-contain" />
          <p className="text-2xl font-bold">Sub Portal</p>
        </div>
        {name ? <h1 className="text-4xl font-black leading-tight">{name}</h1> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- QR data URL made in the browser */}
        <img src={qrDataUrl} alt="QR code for the sub portal" className="w-full max-w-[3.2in]" />
        <p className="break-all text-base text-slate-600">{url}</p>
        <div className="grid w-full gap-4 text-left sm:grid-cols-3">
          {INVITE_LANGUAGES.map((lang) => (
            <div key={lang.title} className="crew-print-row rounded-xl border border-slate-300 p-3">
              <p className="text-base font-black">{lang.title}</p>
              <p className="mt-1 text-sm font-bold">{lang.login(email)}</p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {lang.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm">{lang.questions}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
