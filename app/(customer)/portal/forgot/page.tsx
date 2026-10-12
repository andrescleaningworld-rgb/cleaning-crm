import LinkRequestForm from "./form";

export const dynamic = "force-dynamic";

// "First time here? Set your password" (?first=1) and "Forgot password?":
// both send a link by email.
export default async function PortalForgotPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  return <LinkRequestForm first={(await searchParams).first === "1"} />;
}
