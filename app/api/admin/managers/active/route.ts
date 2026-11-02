// The one list every Manager dropdown shows: the Staff list (Settings ->
// Equipment Categories and Staff), role Manager, active. No office or inside
// staff. "CW" is the company, not a person, and is never on it (the same rule
// as the Pin Board squares). Any manager or the owner can read it (the
// proxy's admin gate).

import { NextResponse } from "next/server";
import { fetchStaff } from "@/lib/data/people";

export async function GET() {
  try {
    const staff = await fetchStaff();
    const names = new Map<string, string>();
    for (const person of staff) {
      const name = person.name.trim();
      if (person.role !== "Manager" || !person.active || !name || name.toLowerCase() === "cw") continue;
      if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    const managers = [...names.values()].sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ success: true, managers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[managers active GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The manager list did not load." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
