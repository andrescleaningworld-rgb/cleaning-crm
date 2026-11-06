import { fetchExtraServices } from "@/lib/data/catalogs";
import { signFileLinks } from "@/lib/files";
import { ServiceForm } from "../request-forms";
import { requireCustomer } from "../server";

export const dynamic = "force-dynamic";

// The list comes from Settings → Extra / Specialty Services: active ones, in their set order.
export default async function PortalExtraServicePage() {
  const { account } = await requireCustomer();
  const services = (await fetchExtraServices().catch(() => []))
    .filter((service) => service.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name, description, imageUrl }) => ({ id, name, description, imageUrl }));
  // Private files: short-lived picture links (lib/files.ts).
  return <ServiceForm accountName={account.accountName} services={signFileLinks(services)} />;
}
