"use client";

// The real Crew Link page (app/porter/[code]/page.tsx), the same component
// crews get, with the preview switched on: a yellow banner, and every Send
// ends on "Preview only — not sent" without posting anything.
import CrewLinkPage from "@/app/porter/[code]/page";
import { CrewLinkPreviewContext, PreviewBanner } from "@/app/porter/[code]/preview";
import { previewBackHref } from "../../back";

const preview = {
  onClose() {
    const back = previewBackHref(new URLSearchParams(window.location.search).get("back"));
    // In the frame, the whole tab goes back; opened on its own, this page does.
    (window.top ?? window).location.assign(back);
  },
};

export default function CrewLinkPreviewScreen() {
  return (
    <CrewLinkPreviewContext.Provider value={preview}>
      <PreviewBanner onClose={preview.onClose} />
      <CrewLinkPage />
    </CrewLinkPreviewContext.Provider>
  );
}
