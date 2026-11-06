"use client";

// Crew Link start screen: the documents the office shared with the sub for
// this building ("Share with sub" on), to open or download. Nothing else
// about them (no notes, no names of who uploaded). Shows nothing when none is
// shared, or with no signal. GET /api/porter-checklist/<code>/documents.

import { useEffect, useState } from "react";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { docTypeWord, sizeText, type DocLang } from "@/lib/accountDocuments";

type CrewDocument = { id: number; name: string; docType: string; fileUrl: string; fileSize: number };

const TITLE: Record<DocLang, string> = { en: "Documents", es: "Documentos", pt: "Documentos" };

export default function CrewDocuments({ code, lang, bothLanguages }: { code: string; lang: TeamHubLang; bothLanguages: boolean }) {
  const [documents, setDocuments] = useState<CrewDocument[]>([]);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    fetch(`/api/porter-checklist/${encodeURIComponent(code)}/documents`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; documents?: CrewDocument[] }) => {
        if (alive && data.success) setDocuments(data.documents ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code]);

  if (documents.length === 0) return null;
  const docLang: DocLang = lang === "es" || lang === "pt" ? lang : "en";

  return (
    <section className="rounded-3xl bg-white px-6 py-5 shadow-sm" aria-label={TITLE[docLang]}>
      <h2 className="text-2xl font-black text-slate-900">
        📎 {bothLanguages ? `${TITLE.en} / ${TITLE.es}` : TITLE[docLang]}
      </h2>
      <ul className="mt-3 space-y-3">
        {documents.map((doc) => (
          <li key={doc.id}>
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-slate-100 px-4 py-3 text-xl font-bold text-blue-800 underline active:bg-slate-200">
              {doc.name}
              <span className="block text-base font-semibold text-slate-600 no-underline">
                {bothLanguages ? `${docTypeWord(doc.docType, "en")} / ${docTypeWord(doc.docType, "es")}` : docTypeWord(doc.docType, docLang)}
                {doc.fileSize > 0 ? ` · ${sizeText(doc.fileSize)}` : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
