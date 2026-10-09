// "+ Extra job": the quick form. Opened from the Extra Jobs page, or from
// an account page with that account already filled in (?accountId=).

import NewExtraJobForm from "./form";

export const dynamic = "force-dynamic";

export default async function NewExtraJobPage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const { accountId } = await searchParams;
  return <NewExtraJobForm accountId={typeof accountId === "string" ? accountId : ""} />;
}
