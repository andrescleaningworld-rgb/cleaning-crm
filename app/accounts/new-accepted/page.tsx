// The old "New Accepted Account" address. That form is now "Add account"
// with its switch on (app/accounts/new/page.tsx): this sends old links and
// bookmarks there, keeping ?markate= (From Markate) and ?from=board.

import { redirect } from "next/navigation";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function NewAcceptedRedirect({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const query = new URLSearchParams({ new: "1" });
  for (const key of ["markate", "from"]) {
    const value = params[key];
    const text = Array.isArray(value) ? value[0] : value;
    if (text) query.set(key, text);
  }
  redirect(`/accounts/new?${query.toString()}`);
}
