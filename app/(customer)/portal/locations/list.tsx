"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorBox } from "@/app/ui";
import { usePortalWords } from "../portal-ui";

type Location = { accountId: string; accountName: string; address: string };

export default function LocationList({ locations, currentId }: { locations: Location[]; currentId: string }) {
  const words = usePortalWords();
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function pick(accountId: string) {
    setBusyId(accountId);
    setError("");
    try {
      const res = await fetch("/api/portal/auth/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error("select");
      router.push("/portal");
      router.refresh();
    } catch {
      setError(words.somethingWrong);
      setBusyId("");
    }
  }

  return (
    <>
      {error ? <ErrorBox title={error} /> : null}
      <div className="ui-tiles">
        {locations.map((location) => (
          <button
            key={location.accountId}
            type="button"
            className="ui-tile"
            aria-current={location.accountId === currentId ? "true" : undefined}
            disabled={busyId !== ""}
            onClick={() => pick(location.accountId)}
          >
            <span className="ui-tile-icon" aria-hidden="true">
              {location.accountId === currentId ? "✅" : "📍"}
            </span>
            <span className="ui-tile-words">
              <span className="ui-tile-label">{location.accountName}</span>
              {location.address ? <span className="ui-tile-detail">{location.address}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
