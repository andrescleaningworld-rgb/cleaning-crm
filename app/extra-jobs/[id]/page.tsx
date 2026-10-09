// One extra job: what it is, the after photos, the Done button, and the two
// work orders to print.

import ExtraJobDetail from "./detail";

export const dynamic = "force-dynamic";

export default async function ExtraJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExtraJobDetail id={id} />;
}
