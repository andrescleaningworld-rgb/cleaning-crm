// Changing an extra job that is still on "Set up": the same quick form,
// filled in. The job's Sale is changed to match.

import ExtraJobForm from "../../new/form";

export const dynamic = "force-dynamic";

export default async function EditExtraJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExtraJobForm editId={id} />;
}
