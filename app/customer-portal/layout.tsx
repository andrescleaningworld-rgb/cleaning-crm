import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { newPortalOn } from "@/lib/portalSession";

export const dynamic = "force-dynamic";

// One customer portal: where the new portal runs, every page of this older
// one sends the customer to /portal. Its code is kept, and it still works
// as before everywhere the new portal is not running.
export default function OldCustomerPortalLayout({ children }: { children: ReactNode }) {
  if (newPortalOn()) redirect("/portal");
  return <>{children}</>;
}
