// The printable work order for one extra job, in two versions:
//   ?copy=sub     for the subcontractor: no customer price
//   ?copy=office  for the office: everything
// Anything other than "office" gives the sub copy, so a mistyped link can
// never show the price.

import WorkOrder from "./work-order";

export const dynamic = "force-dynamic";

export default async function WorkOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ copy?: string }> }) {
  const { id } = await params;
  const { copy } = await searchParams;
  return <WorkOrder id={id} copy={copy === "office" ? "office" : "sub"} />;
}
