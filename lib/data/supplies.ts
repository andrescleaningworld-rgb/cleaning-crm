// Supplies and Supply Orders. Today both go through Apps Script inside
// app/api/supplies and app/api/supply-orders; with DATA_SOURCE_SUPPLIES set
// to "postgres" those routes use the functions below instead and Apps
// Script is not called. Unset (the default) changes nothing.

import { isPostgres } from "@/lib/dataSource";

export {
  addSupplyItem,
  createSupplyOrder,
  deactivateSupplyItem,
  getSupplyItemsAdminShape,
  getSupplyOrdersShape,
  markSupplyOrderEmail,
  updateSupplyItem,
  updateSupplyOrderStatus,
} from "@/lib/pg/supplies";
export type { NewSupplyOrder, SupplyItemAdmin, SupplyOrderRow } from "@/lib/pg/supplies";

export const suppliesOnPostgres = () => isPostgres("SUPPLIES");
