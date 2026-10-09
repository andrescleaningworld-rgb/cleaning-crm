// The loading screen: navy, the logo, and the house rule in big white letters.
// Next.js shows it while a page is being fetched.

import Image from "next/image";
import { MOTTO } from "@/app/ui/words";

export default function Loading() {
  return (
    <div className="cw-loading" role="status" aria-live="polite">
      <div className="cw-loading-logo">
        <Image src="/cw-emblem.png" alt="Cleaning World" width={276} height={180} priority unoptimized className="h-full w-full object-contain" />
      </div>
      <p className="cw-loading-motto">{MOTTO.en}</p>
      <p className="cw-loading-wait">Loading…</p>
    </div>
  );
}
