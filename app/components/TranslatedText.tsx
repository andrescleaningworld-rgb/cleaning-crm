"use client";

// SHARED TRANSLATION display contract (docs/team-hub-spec.md §12): admin
// screens show worker-written text in English first, with a small "Show
// original" toggle — never only the original, never a silent auto-
// translation with no way to see what was actually typed. Used anywhere a
// translated note is rendered (Team Hub tab, staff queue, Sub Center).
import { useState } from "react";

export default function TranslatedText({
  original,
  english,
  language,
  className,
}: {
  original: string;
  english: string | null;
  language: string | null;
  className?: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);

  if (!original) return null;

  const hasRealTranslation = Boolean(english) && Boolean(language) && language !== "en" && english !== original;
  if (!hasRealTranslation) {
    return <span className={className}>{original}</span>;
  }

  return (
    <span className={className}>
      {showOriginal ? original : english}{" "}
      <button type="button" onClick={() => setShowOriginal((v) => !v)} className="text-xs font-semibold text-blue-700 hover:underline">
        {showOriginal ? "Show English" : "Show original"}
      </button>
    </span>
  );
}
