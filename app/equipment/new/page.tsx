"use client";

// "Add equipment" — one screen, one job: photo, name, tag, type, Save.
// Saving opens the new item's page.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EquipmentCategory } from "../types";
import { EquipmentForm, EquipmentShell } from "../ui";

export default function AddEquipmentPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);

  useEffect(() => {
    fetch("/api/equipment-categories", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success?: boolean; categories?: EquipmentCategory[] }) => {
        if (data.success && Array.isArray(data.categories)) setCategories(data.categories);
      })
      .catch(() => {
        // "Type" just shows "No type" until the page is reloaded
      });
  }, []);

  return (
    <EquipmentShell back={{ href: "/equipment", label: "Equipment" }} title="Add equipment">
      <EquipmentForm
        item={null}
        categories={categories}
        onSaved={(id) => router.push(id ? `/equipment/${encodeURIComponent(id)}` : "/equipment")}
        onCancel={() => router.push("/equipment")}
      />
    </EquipmentShell>
  );
}
