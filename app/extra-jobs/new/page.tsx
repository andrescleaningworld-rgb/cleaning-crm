// "+ Extra job": the quick form. Opened from the Extra Jobs page, or from
// an account page with that account already filled in (?accountId=), or
// from the Pin Board (?from=board, so the back arrow goes back there).
// ?returnTo= (an account page): Save goes back there instead of the job.
// ?markate=<id> (Markate checked popup): filled from a one-time estimate.

import NewExtraJobForm from "./form";
import { safeReturnTo } from "@/lib/returnTo";

export const dynamic = "force-dynamic";

export default async function NewExtraJobPage({ searchParams }: { searchParams: Promise<{ accountId?: string; from?: string; returnTo?: string; markate?: string }> }) {
  const { accountId, from, returnTo, markate } = await searchParams;
  return <NewExtraJobForm markateId={typeof markate === "string" && /^\d+$/.test(markate) ? markate : ""} accountId={typeof accountId === "string" ? accountId : ""} from={from === "board" ? "board" : ""} returnTo={safeReturnTo(typeof returnTo === "string" ? returnTo : "")} />;
}
