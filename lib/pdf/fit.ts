// One page, or the scope of work on page 2: the rule every account packet PDF
// follows (lib/pdf/account-packet.tsx, account-packet-admin.tsx,
// sub-packet.tsx). Server only.
//
// How "the scope is too long" is decided: by laying the page out, not by
// counting characters. The packet is made once with the scope on page 1. If
// that comes out longer than one page, it is made again with ONLY the scope
// on page 2 ("Scope of work: see page 2" in its place on page 1). So the
// answer always matches what is printed, whatever the font, the column width
// or how long the other sections are.

import type { ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

/** The pages in a PDF made by @react-pdf/renderer (each page is one "/Type /Page" object, never compressed). */
export function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

export async function renderScopeFitted(make: (scopeOnPage2: boolean) => ReactElement<DocumentProps>): Promise<Buffer> {
  const onePage = await renderToBuffer(make(false));
  if (pdfPageCount(onePage) <= 1) return onePage;
  return renderToBuffer(make(true));
}
