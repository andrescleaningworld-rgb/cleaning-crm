"use client";

// Account page -> More -> "Photos from the sub": the before / after photos
// subcontractors took at this account from their portal home. Shows nothing
// where that is not turned on, or when there are no photos yet.

import { useEffect, useState } from "react";

type Photo = { url: string; moment: string; subName: string; takenAt: string };

export default function SitePhotos({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/handoffs/photos?accountId=${encodeURIComponent(accountId)}&accountName=${encodeURIComponent(accountName)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { photos?: Photo[] }) => {
        if (!cancelled) setPhotos(data.photos ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountId, accountName]);

  if (photos.length === 0) return null;

  return (
    <section className="ui-card ui-stack account-detail-print-hide">
      <h2 className="ui-card-title">Photos from the sub ({photos.length})</h2>
      <div className="ui-photos">
        {photos.map((photo) => (
          <a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer" className="ui-photo" title={`${photo.moment === "before" ? "Before" : "After"} · ${photo.subName} · ${new Date(photo.takenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`${photo.moment === "before" ? "Before" : "After"} photo by ${photo.subName}`} loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  );
}
