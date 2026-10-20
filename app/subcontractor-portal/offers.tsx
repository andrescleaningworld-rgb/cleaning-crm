"use client";

// Step 3 of the New Account flow, on the sub's side: a new account the office
// offered to this sub. Address, days, time and how long, then two big
// buttons. Yes: the account is theirs and the office moves on. No: the office
// picks someone else (the manager gets a text). Shows nothing when no offer
// is waiting. Server: app/api/subcontractor-portal/offers.

import { useCallback, useEffect, useState } from "react";
import type { UiLang } from "@/app/ui/words";
import type { SubOffer } from "@/lib/accountFlow";
import { formatClock, parseClock } from "@/lib/schedule-time";
import { formatMinutes } from "@/lib/time-on-site";

const WORDS: Record<UiLang, { title: string; address: string; days: string; time: string; needed: string; yes: string; no: string; thanksYes: string; thanksNo: string; failed: string }> = {
  en: {
    title: "New account for you",
    address: "Address",
    days: "Days",
    time: "Time",
    needed: "Time needed",
    yes: "Yes, I can do it",
    no: "No, I can't",
    thanksYes: "Thank you! The office will call you with the next steps.",
    thanksNo: "Thank you for letting us know.",
    failed: "That did not save. Try again.",
  },
  es: {
    title: "Cuenta nueva para usted",
    address: "Dirección",
    days: "Días",
    time: "Hora",
    needed: "Tiempo necesario",
    yes: "Sí, puedo hacerlo",
    no: "No, no puedo",
    thanksYes: "¡Gracias! La oficina le llamará con los próximos pasos.",
    thanksNo: "Gracias por avisarnos.",
    failed: "No se guardó. Intente de nuevo.",
  },
  pt: {
    title: "Conta nova para você",
    address: "Endereço",
    days: "Dias",
    time: "Hora",
    needed: "Tempo necessário",
    yes: "Sim, eu posso",
    no: "Não, não posso",
    thanksYes: "Obrigado! O escritório vai ligar com os próximos passos.",
    thanksNo: "Obrigado por avisar.",
    failed: "Não foi salvo. Tente de novo.",
  },
};

export default function SubOffers({ lang }: { lang: UiLang }) {
  const words = WORDS[lang] ?? WORDS.en;
  const [offers, setOffers] = useState<SubOffer[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/subcontractor-portal/offers", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; offers?: SubOffer[] };
      setOffers(data.success && Array.isArray(data.offers) ? data.offers : []);
    } catch {
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(offer: SubOffer, yes: boolean) {
    setBusy(offer.accountId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/subcontractor-portal/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: offer.accountId, answer: yes ? "yes" : "no" }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || words.failed);
      setMessage(yes ? words.thanksYes : words.thanksNo);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : words.failed);
    } finally {
      setBusy("");
    }
  }

  if (offers.length === 0 && !message) return null;

  return (
    <div className="ui-stack" style={{ marginBottom: 16 }}>
      {message ? <div className="ui-savestatus ui-savestatus-saved">{message}</div> : null}
      {error ? <div className="ui-field-error">{error}</div> : null}
      {offers.map((offer) => {
        const start = parseClock(offer.start);
        return (
          <section key={offer.accountId} className="ui-card">
            <p className="ui-section-title">{words.title}</p>
            <h2 className="ui-acct-name">{offer.accountName}</h2>
            <dl className="ui-details">
              {offer.address ? (
                <div className="ui-detail">
                  <dt>{words.address}</dt>
                  <dd>{offer.address}</dd>
                </div>
              ) : null}
              {offer.days ? (
                <div className="ui-detail">
                  <dt>{words.days}</dt>
                  <dd>{offer.days}</dd>
                </div>
              ) : null}
              {start !== null ? (
                <div className="ui-detail">
                  <dt>{words.time}</dt>
                  <dd>{formatClock(start)}</dd>
                </div>
              ) : null}
              {offer.minutes ? (
                <div className="ui-detail">
                  <dt>{words.needed}</dt>
                  <dd>{formatMinutes(offer.minutes)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="ui-stack" style={{ marginTop: 12 }}>
              <button type="button" className="ui-btn ui-btn-main w-full" disabled={busy !== ""} onClick={() => void answer(offer, true)}>
                {busy === offer.accountId ? "…" : words.yes}
              </button>
              <button type="button" className="ui-btn ui-btn-second w-full" disabled={busy !== ""} onClick={() => void answer(offer, false)}>
                {words.no}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
