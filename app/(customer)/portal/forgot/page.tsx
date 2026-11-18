import { getOfficePhone } from "@/lib/pg/portal-auth";
import LinkRequestForm from "./form";

export const dynamic = "force-dynamic";

// "First time here? Set your password" (?first=1) and "Forgot password?":
// both send a link by email. The office number (Settings → Customer Portal
// Access) is for "Nothing came? Call us": a link only goes to the email on
// the account, and the screen cannot say which one that is.
export default async function PortalForgotPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const officePhone = await getOfficePhone().catch(() => "");
  return <LinkRequestForm first={(await searchParams).first === "1"} officePhone={officePhone} />;
}
