"use client";

// The sub portal's "Documents" box: files the office shared with this sub
// ("Share with sub" on an account's document), grouped by account. View and
// download only (GET /api/subcontractor-portal/documents). Shows nothing when
// nothing is shared.

import { useEffect, useState } from "react";
import type { UiLang } from "@/app/ui/words";
import { docTypeWord, sizeText, type SharedDocument } from "@/lib/accountDocuments";

const WORDS: Record<UiLang, { title: string; text: string; open: string }> = {
  en: { title: "Documents", text: "Files the office shared with you for your accounts. Tap one to open or download it.", open: "Open" },
  es: { title: "Documentos", text: "Archivos que la oficina compartió con usted para sus cuentas. Toque uno para abrirlo o descargarlo.", open: "Abrir" },
  pt: { title: "Documentos", text: "Arquivos que o escritório compartilhou com você para suas contas. Toque em um para abrir ou baixar.", open: "Abrir" },
};

export default function SubDocuments({ lang }: { lang: UiLang }) {
  const words = WORDS[lang] ?? WORDS.en;
  const [documents, setDocuments] = useState<SharedDocument[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/subcontractor-portal/documents", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; documents?: SharedDocument[] }) => {
        if (alive && data.success) setDocuments(data.documents ?? []);
      })
      // Best effort: the box just does not show.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (documents.length === 0) return null;

  // Grouped by account, in the order the server sends (account, then newest first).
  const groups: { accountName: string; documents: SharedDocument[] }[] = [];
  for (const doc of documents) {
    const last = groups[groups.length - 1];
    if (last && last.accountName === doc.accountName) last.documents.push(doc);
    else groups.push({ accountName: doc.accountName, documents: [doc] });
  }

  return (
    <section className="ui-card" aria-label={words.title}>
      <h2 className="ui-card-title">📎 {words.title}</h2>
      <p className="ui-muted">{words.text}</p>
      <div className="mt-4 space-y-3">
        {groups.map((group) => (
          <div key={group.accountName} className="ui-stat">
            <p className="ui-strong">{group.accountName}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {group.documents.map((doc) => (
                <li key={doc.id}>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ui-account-link" style={{ fontSize: 18 }}>
                    {doc.name}
                  </a>
                  <span className="ui-muted" style={{ display: "block" }}>
                    {docTypeWord(doc.docType, lang)}
                    {doc.fileSize > 0 ? ` · ${sizeText(doc.fileSize)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
