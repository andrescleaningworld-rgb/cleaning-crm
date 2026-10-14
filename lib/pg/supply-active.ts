// A Supplies product that is in use (not Inactive or Removed), as SQL on the
// sub_supplies columns. Its own file, with no imports, so the supplies,
// supply control and one-list modules can all use it without importing
// each other.
export const ACTIVE_ITEM = `btrim(supply_item) <> '' AND lower(btrim(status)) NOT IN ('inactive', 'removed') AND lower(btrim(active_raw)) NOT IN ('no', 'false', 'inactive', 'n', 'disabled', 'removed')`;
