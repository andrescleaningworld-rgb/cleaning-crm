export type EquipmentStatus = "Available" | "CheckedOut" | "InRepair" | "Retired";
export type EquipmentHolderType = "InsideStaff" | "Sub";

export type EquipmentItem = {
  sheetRow: number;
  id: string;
  name: string;
  categoryId: string;
  serialNumber: string;
  purchaseDate: string;
  purchaseCost: number;
  status: EquipmentStatus;
  currentHolderType: EquipmentHolderType | "";
  currentHolderId: string;
  currentHolderName: string;
  conditionNotes: string;
  photoUrl: string;
  createdAt: string;
  checkedOutAt: string;
  expectedReturnAt: string;
  needsMaintenanceReview: boolean;
  overdue: boolean;
};

export type EquipmentCategory = {
  sheetRow: number;
  id: string;
  name: string;
  active: boolean;
};

export type StaffRole = "Manager" | "OfficeStaff" | "InsideStaff";

export type Staff = {
  sheetRow: number;
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
};

export type EquipmentCheckout = {
  sheetRow: number;
  id: string;
  equipmentId: string;
  holderType: EquipmentHolderType | "";
  holderId: string;
  holderName: string;
  accountId: string;
  checkedOutAt: string;
  expectedReturnAt: string;
  returnedAt: string;
  conditionAtCheckout: string;
  conditionAtReturn: string;
  signedOutByStaffId: string;
  signedOutByStaffName: string;
  signedInByStaffId: string;
  signedInByStaffName: string;
  notes: string;
  workOrderNumber: string;
};

export type EquipmentRepairStatus = "Open" | "Completed";

export type EquipmentRepair = {
  sheetRow: number;
  id: string;
  equipmentId: string;
  startedAt: string;
  completedAt: string;
  description: string;
  cost: number;
  performedBy: string;
  partsUsed: string;
  status: EquipmentRepairStatus;
};

export type EquipmentPart = {
  sheetRow: number;
  id: string;
  partName: string;
  compatibleEquipmentId: string;
  supplier: string;
  unitCost: number;
  stockQty: number;
  lowStockThreshold: number;
  lowStock: boolean;
};

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  Available: "Available",
  CheckedOut: "Checked Out",
  InRepair: "In Repair",
  Retired: "Retired",
};

export function statusBadgeClass(status: EquipmentStatus, overdue: boolean): string {
  if (overdue) return "border-red-300 bg-red-100 text-red-800";
  switch (status) {
    case "Available":
      return "border-green-200 bg-green-100 text-green-800";
    case "CheckedOut":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "InRepair":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "Retired":
      return "border-gray-200 bg-gray-100 text-gray-600";
    default:
      return "border-gray-200 bg-gray-100 text-gray-600";
  }
}
