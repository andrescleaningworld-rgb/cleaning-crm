// "+ Extra job": the quick form. Opened from the Extra Jobs page, or from
// an account page with that account already filled in (?accountId=), or
// from the Pin Board (?from=board, so the back arrow goes back there).

import NewExtraJobForm from "./form";

export const dynamic = "force-dynamic";

export default async function NewExtraJobPage({ searchParams }: { searchParams: Promise<{ accountId?: string; from?: string }> }) {
  const { accountId, from } = await searchParams;
  return <NewExtraJobForm accountId={typeof accountId === "string" ? accountId : ""} from={from === "board" ? "board" : ""} />;
}
