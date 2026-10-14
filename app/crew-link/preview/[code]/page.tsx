// "See what the crew sees" (admin only: /crew-link is behind the admin login
// in proxy.ts). The real crew screens run in a frame (./screen), so they look
// and scroll exactly as on a phone: a phone-sized frame on a computer, the
// whole screen on a phone. Nothing sent from them is saved (app/porter/[code]/preview.tsx).
import type { Metadata } from "next";
import { previewBackHref } from "../back";

export const metadata: Metadata = {
  title: "See what the crew sees",
  robots: { index: false, follow: false, nocache: true },
};

export default async function CrewLinkPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ back?: string | string[] }>;
}) {
  const { code } = await params;
  const { back: rawBack } = await searchParams;
  const back = previewBackHref(Array.isArray(rawBack) ? rawBack[0] : rawBack);
  const src = `/crew-link/preview/${encodeURIComponent(code)}/screen?back=${encodeURIComponent(back)}`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-800 sm:items-center sm:justify-center sm:gap-4 sm:p-6">
      <div className="hidden w-[390px] items-center justify-between gap-3 text-white sm:flex">
        <p className="text-lg font-black">See what the crew sees</p>
        <a href={back} className="rounded-xl bg-white px-4 py-2 font-black text-slate-900 hover:bg-slate-100">
          Close preview
        </a>
      </div>
      <iframe
        src={src}
        title="What the crew sees"
        className="w-full flex-1 border-0 bg-slate-100 sm:h-[min(820px,calc(100dvh-120px))] sm:w-[390px] sm:flex-none sm:rounded-[40px] sm:border-[12px] sm:border-solid sm:border-black sm:shadow-2xl"
      />
    </div>
  );
}
