"use client";

// Account page -> More -> "Photos": opens the Photos page filtered to this
// account. Shows nothing where FEATURE_PHOTOS is off.

import { useEffect, useState } from "react";
import { BigButton } from "@/app/ui";

export default function PhotosLink({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/photo-index?flag=1")
      .then((response) => response.json())
      .then((data: { on?: boolean }) => {
        if (!cancelled) setOn(data.on === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!on) return null;
  return (
    <BigButton kind="second" href={`/photos?account=${encodeURIComponent(accountName)}&accountId=${encodeURIComponent(accountId)}`}>
      Photos
    </BigButton>
  );
}
