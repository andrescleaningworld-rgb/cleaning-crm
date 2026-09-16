// Public roster for the manager login picker — Active managers from the
// Sheet joined with whether they've set a password yet (manager_accounts).
// Deliberately never includes owner data; the owner reaches their own login
// via a separate, unlisted route.
import { NextResponse } from "next/server";
import { getIdentityRoster } from "@/lib/managerAccounts";

export async function GET() {
  try {
    const identities = await getIdentityRoster();
    return NextResponse.json({ success: true, identities });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not load managers." },
      { status: 500 }
    );
  }
}
