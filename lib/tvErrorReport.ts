// What a TV may send about an error that broke its board (app/board/tv/tv-safety.tsx
// sends it, app/api/board/tv/report/route.ts writes it to the server log).
// Plain TS, no browser or server calls, so both sides scrub it the same way.
//
// Only four things, each cut short: the error message, its stack, the
// browser's name and version, and the time. Never the page address, the TV's
// key (?k=) or any other token: every address is cut down to its file name and
// line, and anything that looks like a key or token is blanked.

export const TV_REPORT_LIMITS = { message: 300, stack: 1500, browser: 300, body: 4000 } as const;

export type TvErrorReport = { message: string; stack: string; browser: string; at: string };

/** Cuts a piece of text down to what is safe to log. */
export function scrubTvText(text: unknown, max: number): string {
  return (
    String(text ?? "")
      // Any address: only its file name and line ("tv-client.js:1:2345"), never the site, the path's query or a #part.
      .replace(/(?:https?|blob|file):\/\/[^\s)'"]*/gi, (url) => {
        // The ":line:column" at the end is kept, even when it comes after a query ("?dpl=...:1:2345").
        const place = /(:\d+:\d+)$/.exec(url)?.[1] ?? "";
        const bare = url.slice(0, url.length - place.length).replace(/[?#].*$/, "");
        const file = bare.slice(bare.lastIndexOf("/") + 1);
        return `${file || "[address]"}${place}`;
      })
      // A query or key left over anywhere ("?k=...", "&token=...", "k: ...").
      .replace(/([?&;]|\b)(k|key|token|secret|code)\s*[=:]\s*[^\s&,;)'"]+/gi, "$1$2=[hidden]")
      // Anything long that looks like a key: hex, base64 or base64url runs.
      // Kept only when it is plain letters (a long function name); with any digit or sign it is hidden.
      .replace(/[A-Za-z0-9_\-+/=]{20,}/g, (run) => (/^[A-Za-z_]+$/.test(run) ? run : "[hidden]"))
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .trim()
      .slice(0, max)
  );
}

/** The report, scrubbed and capped. */
export function tvErrorReport(input: { message?: unknown; stack?: unknown; browser?: unknown; at?: unknown }): TvErrorReport {
  const at = new Date(String(input.at ?? ""));
  return {
    message: scrubTvText(input.message, TV_REPORT_LIMITS.message) || "(no message)",
    stack: scrubTvText(input.stack, TV_REPORT_LIMITS.stack),
    browser: scrubTvText(input.browser, TV_REPORT_LIMITS.browser),
    at: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString(),
  };
}
