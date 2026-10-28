import { EmptyState, Screen } from "@/app/ui";
import { listPortalPhotos } from "@/lib/pg/crew-photos";
import type { PortalPhoto } from "@/lib/crewPhotos";
import { LangToggle } from "../portal-ui";
import { requireCustomer } from "../server";
import { portalDay } from "../words";

export const dynamic = "force-dynamic";

/** The office's day (YYYY-MM-DD) of a moment: photos are grouped by it. */
const officeDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// "Photos": what the crew sent from Crew Link ("Send photos") for THIS
// account only, newest first, by day. Small copies in the grid; a tap opens
// the full photo. Never a photo the office hid (a Problem photo starts
// hidden), and nothing when the account's "Show crew photos to customer" is
// off (lib/pg/crew-photos.ts listPortalPhotos).
export default async function PortalPhotosPage() {
  const { account, lang, words } = await requireCustomer();
  const photos: PortalPhoto[] = await listPortalPhotos(account.accountId).catch(() => []);
  const days: { day: string; photos: PortalPhoto[] }[] = [];
  for (const photo of photos) {
    const day = officeDay(photo.takenAt);
    const last = days[days.length - 1];
    if (last?.day === day) last.photos.push(photo);
    else days.push({ day, photos: [photo] });
  }

  return (
    <Screen title={words.photos} subtitle={account.accountName} backHref="/portal" headerRight={<LangToggle />}>
      {photos.length === 0 ? (
        <EmptyState icon="inbox" title={words.noPhotos} />
      ) : (
        <>
          <p className="ui-muted">{words.photosIntro}</p>
          {days.map((group) => (
            <section key={group.day} aria-label={portalDay(group.day, lang)} style={{ marginTop: 16 }}>
              <h2 className="ui-portal-heading">
                {portalDay(group.day, lang)} · {group.photos.length}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                {group.photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" style={{ position: "relative", display: "block" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.thumbUrl} alt={words.photos} loading="lazy" decoding="async" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 12, display: "block" }} />
                    {photo.tag && words.photoTags[photo.tag] ? (
                      <span style={{ position: "absolute", left: 6, bottom: 6, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 13, fontWeight: 800, borderRadius: 8, padding: "2px 8px" }}>
                        {words.photoTags[photo.tag]}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </Screen>
  );
}
