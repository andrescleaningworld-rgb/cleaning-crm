// Self-declared identity for the checkout/return modal's "signed by" picker
// — same localStorage-backed pattern as OneSignalInit.tsx's manager
// identity (getStoredManagerId/identifyManager), no new login system.
const STAFF_ID_STORAGE_KEY = "cwEquipmentStaffId";

export function getStoredEquipmentStaffId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STAFF_ID_STORAGE_KEY) ?? "";
}

export function setStoredEquipmentStaffId(staffId: string): void {
  if (typeof window === "undefined") return;
  if (!staffId) {
    window.localStorage.removeItem(STAFF_ID_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STAFF_ID_STORAGE_KEY, staffId);
}
