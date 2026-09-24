"use client";

// "Staff & PINs" — its own screen off the Equipment home.
import StaffManager from "../StaffManager";
import { EquipmentShell } from "../ui";

export default function EquipmentStaffPage() {
  return (
    <EquipmentShell back={{ href: "/equipment", label: "Equipment" }} title="Staff & PINs">
      <StaffManager />
    </EquipmentShell>
  );
}
