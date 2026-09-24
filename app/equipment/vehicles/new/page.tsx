"use client";

// "Add vehicle" — name, plate, driver, mileage; the rest under "More
// details". The default service items are added automatically. Saving
// opens the new vehicle's page.
import { useRouter } from "next/navigation";
import { EquipmentShell } from "../../ui";
import { VehicleForm, useStaffList } from "../vehicleUi";

export default function AddVehiclePage() {
  const router = useRouter();
  const staff = useStaffList();
  return (
    <EquipmentShell back={{ href: "/equipment/vehicles", label: "Vehicles" }} title="Add vehicle">
      <VehicleForm
        vehicle={null}
        staff={staff}
        onSaved={(id) => router.push(id ? `/equipment/vehicles/${id}` : "/equipment/vehicles")}
        onCancel={() => router.push("/equipment/vehicles")}
      />
    </EquipmentShell>
  );
}
