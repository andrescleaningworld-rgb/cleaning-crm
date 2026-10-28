// The cookies of staff "View as customer" (lib/portalPreview.ts) and of a
// shared preview link (lib/portalPreviewLink.ts), on their own so proxy.ts
// can read their names without loading database code.
export const PORTAL_PREVIEW_COOKIE = "cw_portal_preview";
export const PORTAL_SHARE_COOKIE = "cw_portal_share";
