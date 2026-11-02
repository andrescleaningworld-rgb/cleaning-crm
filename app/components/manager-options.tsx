"use client";

// Every Manager dropdown's list: the active managers on the Staff list
// (GET /api/admin/managers/active). One fetch for the whole screen, kept a
// minute. Filters match with managerMatches (lib/managerNames.ts).

import { useEffect, useState } from "react";
import { sameManager } from "@/lib/managerNames";

const TTL_MS = 60_000;
let cache: { names: string[]; expiresAt: number } | null = null;
let pending: Promise<string[] | null> | null = null;

/** The active managers' names, or null when the list did not load. */
export function loadManagerNames(): Promise<string[] | null> {
  if (cache && Date.now() <= cache.expiresAt) return Promise.resolve(cache.names);
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch("/api/admin/managers/active", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; managers?: string[] };
      if (!response.ok || !data.success || !Array.isArray(data.managers)) return null;
      cache = { names: data.managers, expiresAt: Date.now() + TTL_MS };
      return data.managers;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export function useManagerNames(): { names: string[]; loading: boolean; failed: boolean } {
  const [state, setState] = useState<{ names: string[]; loading: boolean; failed: boolean }>(() =>
    cache && Date.now() <= cache.expiresAt ? { names: cache.names, loading: false, failed: false } : { names: [], loading: true, failed: false }
  );
  useEffect(() => {
    let alive = true;
    void loadManagerNames().then((names) => {
      if (alive) setState({ names: names ?? [], loading: false, failed: names === null });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/**
 * The <option>s of a Manager dropdown in a form. A value already saved that
 * is not one of the active managers ("Greg , Andres", someone who left) stays
 * as its own option, so opening and saving the form never wipes it.
 */
export function ManagerOptions({ names, current = "" }: { names: string[]; current?: string }) {
  const saved = current.trim();
  const keep = saved !== "" && !names.some((name) => name === saved);
  return (
    <>
      {keep ? <option value={saved}>{names.some((name) => sameManager(name, saved)) ? saved : `${saved} (not on the Staff list)`}</option> : null}
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </>
  );
}
