// Server-only Postgres query layer for the Site Supply Link feature (see
// scripts/setup-site-link-db.js). Mirrors the one-file-per-feature,
// typed-function convention used in lib/checklistDb.ts.
//
// SECURITY-CRITICAL CONVENTION: every function whose name starts with
// "public" is called from the no-login /api/site-link/[token]/* routes and
// must NEVER return an account_id, sub_id, or any field sourced from the
// Accounts/Subcontractors sheets (name, address, contacts, key/alarm info,
// billing, other links for the same account, etc.) — only link.label and
// the caller's own submission history. Functions without that prefix are
// admin-only (called from app/api/admin/site-links/* routes, which sit
// behind proxy.ts's default admin gate) and may return account_id/sub_id
// freely for the admin UI to resolve against Sheets.
import crypto from "node:crypto";
import { getSql } from "@/lib/db";

export function generateSiteLinkToken(): string {
  // 24 random bytes -> 32 base64url characters (24 is divisible by 3, so no
  // padding) — comfortably over the >=32 char requirement and URL-safe with
  // no encoding needed in the /s/[token] path segment.
  return crypto.randomBytes(24).toString("base64url");
}

// ─── Admin: site_links ──────────────────────────────────────────────────

export type SiteLink = {
  id: number;
  token: string;
  accountId: string;
  subId: string | null;
  label: string;
  active: boolean;
  createdAt: string;
  revokedAt: string | null;
};

function rowToSiteLink(row: Record<string, unknown>): SiteLink {
  return {
    id: row.id as number,
    token: row.token as string,
    accountId: row.account_id as string,
    subId: (row.sub_id as string | null) ?? null,
    label: row.label as string,
    active: row.active as boolean,
    createdAt: toIso(row.created_at),
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

export async function listSiteLinks(): Promise<SiteLink[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM site_links ORDER BY created_at DESC LIMIT 500`;
  return rows.map((r) => rowToSiteLink(r as Record<string, unknown>));
}

export async function getSiteLinkById(id: number): Promise<SiteLink | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM site_links WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToSiteLink(rows[0] as Record<string, unknown>) : null;
}

export async function createSiteLink(input: {
  accountId: string;
  subId: string | null;
  label: string;
}): Promise<SiteLink> {
  const sql = getSql();
  const token = generateSiteLinkToken();
  const rows = await sql`
    INSERT INTO site_links (token, account_id, sub_id, label)
    VALUES (${token}, ${input.accountId}, ${input.subId}, ${input.label})
    RETURNING *
  `;
  return rowToSiteLink(rows[0] as Record<string, unknown>);
}

export async function setSiteLinkActive(id: number, active: boolean): Promise<SiteLink | null> {
  const sql = getSql();
  const rows = active
    ? await sql`UPDATE site_links SET active = true, revoked_at = NULL WHERE id = ${id} RETURNING *`
    : await sql`UPDATE site_links SET active = false, revoked_at = now() WHERE id = ${id} RETURNING *`;
  return rows.length > 0 ? rowToSiteLink(rows[0] as Record<string, unknown>) : null;
}

// A regenerated token invalidates the old link immediately (old token
// simply no longer matches any row) — the sub gets a new link to share,
// same label/account/sub/history.
export async function regenerateSiteLinkToken(id: number): Promise<SiteLink | null> {
  const sql = getSql();
  const token = generateSiteLinkToken();
  const rows = await sql`UPDATE site_links SET token = ${token} WHERE id = ${id} RETURNING *`;
  return rows.length > 0 ? rowToSiteLink(rows[0] as Record<string, unknown>) : null;
}

export async function updateSiteLinkLabel(id: number, label: string): Promise<SiteLink | null> {
  const sql = getSql();
  const rows = await sql`UPDATE site_links SET label = ${label} WHERE id = ${id} RETURNING *`;
  return rows.length > 0 ? rowToSiteLink(rows[0] as Record<string, unknown>) : null;
}

// ─── Public: token resolution ───────────────────────────────────────────

// Internal shape — carries account_id so the API route can resolve the
// real account name server-side for admin/email use, but the route handler
// is responsible for never putting account_id/accountName in a response
// body sent back to the /s/[token] page.
type SiteLinkInternal = {
  id: number;
  accountId: string;
  label: string;
  active: boolean;
};

export async function getActiveSiteLinkByToken(token: string): Promise<SiteLinkInternal | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, account_id, label, active FROM site_links WHERE token = ${token} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  if (!row.active) return null;
  return {
    id: row.id as number,
    accountId: row.account_id as string,
    label: row.label as string,
    active: row.active as boolean,
  };
}

// ─── supply_items (catalog) ─────────────────────────────────────────────

export type SupplyItem = {
  id: number;
  name: string;
  unit: string;
  sortOrder: number;
  active: boolean;
};

function rowToSupplyItem(row: Record<string, unknown>): SupplyItem {
  return {
    id: row.id as number,
    name: row.name as string,
    unit: row.unit as string,
    sortOrder: row.sort_order as number,
    active: row.active as boolean,
  };
}

export async function listSupplyItems(activeOnly: boolean): Promise<SupplyItem[]> {
  const sql = getSql();
  const rows = activeOnly
    ? await sql`SELECT * FROM supply_items WHERE active = true ORDER BY sort_order ASC, name ASC`
    : await sql`SELECT * FROM supply_items ORDER BY sort_order ASC, name ASC`;
  return rows.map((r) => rowToSupplyItem(r as Record<string, unknown>));
}

// Public: the allowed items for one link — if site_link_items has no rows
// for this link_id, every active catalog item is allowed (no per-site
// restriction configured); if it has rows, only those (still filtered to
// active, so deactivating an item removes it from every link that had
// explicitly allowed it too).
export async function listSupplyItemsForLink(linkId: number): Promise<SupplyItem[]> {
  const sql = getSql();
  const restricted = await sql`SELECT 1 FROM site_link_items WHERE link_id = ${linkId} LIMIT 1`;
  const rows =
    restricted.length > 0
      ? await sql`
          SELECT si.* FROM supply_items si
          JOIN site_link_items sli ON sli.item_id = si.id
          WHERE sli.link_id = ${linkId} AND si.active = true
          ORDER BY si.sort_order ASC, si.name ASC
        `
      : await sql`SELECT * FROM supply_items WHERE active = true ORDER BY sort_order ASC, name ASC`;
  return rows.map((r) => rowToSupplyItem(r as Record<string, unknown>));
}

export async function createSupplyItem(input: { name: string; unit: string; sortOrder: number }): Promise<SupplyItem> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO supply_items (name, unit, sort_order) VALUES (${input.name}, ${input.unit}, ${input.sortOrder})
    RETURNING *
  `;
  return rowToSupplyItem(rows[0] as Record<string, unknown>);
}

export async function updateSupplyItem(
  id: number,
  input: Partial<{ name: string; unit: string; sortOrder: number; active: boolean }>
): Promise<SupplyItem | null> {
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM supply_items WHERE id = ${id} LIMIT 1`;
  if (existingRows.length === 0) return null;
  const existing = rowToSupplyItem(existingRows[0] as Record<string, unknown>);

  const name = input.name ?? existing.name;
  const unit = input.unit ?? existing.unit;
  const sortOrder = input.sortOrder ?? existing.sortOrder;
  const active = input.active ?? existing.active;

  const rows = await sql`
    UPDATE supply_items SET name = ${name}, unit = ${unit}, sort_order = ${sortOrder}, active = ${active}
    WHERE id = ${id}
    RETURNING *
  `;
  return rowToSupplyItem(rows[0] as Record<string, unknown>);
}

export async function setSiteLinkAllowedItems(linkId: number, itemIds: number[]): Promise<void> {
  const sql = getSql();
  // Whole-list replace, wrapped so a partial failure can't leave the
  // allow-list half-written — delete-then-insert in one round trip isn't
  // atomic across two separate sql`` calls otherwise.
  await sql`DELETE FROM site_link_items WHERE link_id = ${linkId}`;
  for (const itemId of itemIds) {
    await sql`INSERT INTO site_link_items (link_id, item_id) VALUES (${linkId}, ${itemId}) ON CONFLICT DO NOTHING`;
  }
}

export async function getSiteLinkAllowedItemIds(linkId: number): Promise<number[]> {
  const sql = getSql();
  const rows = await sql`SELECT item_id FROM site_link_items WHERE link_id = ${linkId}`;
  return rows.map((r) => (r as { item_id: number }).item_id);
}

// ─── supply_orders / supply_order_lines ─────────────────────────────────

export type OrderLineInput = { itemId: number; qty: number };

export async function createSupplyOrder(input: {
  linkId: number;
  note: string;
  lines: OrderLineInput[];
}): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO supply_orders (link_id, note) VALUES (${input.linkId}, ${input.note})
    RETURNING id
  `;
  const orderId = (rows[0] as { id: number }).id;

  for (const line of input.lines) {
    await sql`
      INSERT INTO supply_order_lines (order_id, item_id, qty) VALUES (${orderId}, ${line.itemId}, ${line.qty})
    `;
  }

  return orderId;
}

export type SupplyOrderLineDetail = { itemId: number; itemName: string; unit: string; qty: number };

export async function getSupplyOrderLines(orderId: number): Promise<SupplyOrderLineDetail[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT sol.item_id, si.name AS item_name, si.unit, sol.qty
    FROM supply_order_lines sol
    JOIN supply_items si ON si.id = sol.item_id
    WHERE sol.order_id = ${orderId}
    ORDER BY si.sort_order ASC, si.name ASC
  `;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      itemId: row.item_id as number,
      itemName: row.item_name as string,
      unit: row.unit as string,
      qty: row.qty as number,
    };
  });
}

export async function updateSupplyOrderStatus(orderId: number, status: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE supply_orders SET status = ${status}, updated_at = now() WHERE id = ${orderId}`;
}

// ─── site_issues / site_issue_photos ────────────────────────────────────

export async function createSiteIssue(input: { linkId: number; category: string; note: string }): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO site_issues (link_id, category, note) VALUES (${input.linkId}, ${input.category}, ${input.note})
    RETURNING id
  `;
  return (rows[0] as { id: number }).id;
}

export async function addSiteIssuePhoto(issueId: number, blobUrl: string): Promise<void> {
  const sql = getSql();
  await sql`INSERT INTO site_issue_photos (issue_id, blob_url) VALUES (${issueId}, ${blobUrl})`;
}

// Ownership check used by the photo-upload route: a photo can only be
// attached to an issue that belongs to the SAME link the caller's token
// resolved to — prevents a valid-token caller from attaching photos to
// another site's issue by guessing/enumerating issue ids.
export async function issueBelongsToLink(issueId: number, linkId: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM site_issues WHERE id = ${issueId} AND link_id = ${linkId} LIMIT 1`;
  return rows.length > 0;
}

export async function getSiteIssuePhotos(issueId: number): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`SELECT blob_url FROM site_issue_photos WHERE issue_id = ${issueId} ORDER BY created_at ASC`;
  return rows.map((r) => (r as { blob_url: string }).blob_url);
}

export async function updateSiteIssueStatus(issueId: number, status: string): Promise<void> {
  const sql = getSql();
  if (status === "resolved") {
    await sql`UPDATE site_issues SET status = ${status}, resolved_at = now() WHERE id = ${issueId}`;
  } else {
    await sql`UPDATE site_issues SET status = ${status}, resolved_at = NULL WHERE id = ${issueId}`;
  }
}

// ─── Public: "Recent" list for one link (order + issue submissions, no
// account/sub fields — label is already known client-side) ──────────────

export type PublicRecentEntry = {
  kind: "order" | "issue";
  id: number;
  summary: string;
  status: string;
  createdAt: string;
};

export async function listPublicRecentForLink(linkId: number, limit: number): Promise<PublicRecentEntry[]> {
  const sql = getSql();

  const orderRows = await sql`
    SELECT so.id, so.status, so.created_at,
           COALESCE(STRING_AGG(si.name || ' x' || sol.qty, ', ' ORDER BY si.sort_order, si.name), '') AS summary
    FROM supply_orders so
    LEFT JOIN supply_order_lines sol ON sol.order_id = so.id
    LEFT JOIN supply_items si ON si.id = sol.item_id
    WHERE so.link_id = ${linkId}
    GROUP BY so.id, so.status, so.created_at
    ORDER BY so.created_at DESC
    LIMIT ${limit}
  `;

  const issueRows = await sql`
    SELECT id, category, status, created_at
    FROM site_issues
    WHERE link_id = ${linkId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  const orders: PublicRecentEntry[] = orderRows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      kind: "order",
      id: row.id as number,
      summary: (row.summary as string) || "Supply order",
      status: row.status as string,
      createdAt: toIso(row.created_at),
    };
  });

  const issues: PublicRecentEntry[] = issueRows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      kind: "issue",
      id: row.id as number,
      summary: row.category as string,
      status: row.status as string,
      createdAt: toIso(row.created_at),
    };
  });

  return [...orders, ...issues]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// ─── Admin: queue (orders + issues across all links, with account_id for
// the caller to resolve real account names against — admin-only) ────────

export type QueueOrderEntry = {
  kind: "order";
  id: number;
  linkId: number;
  accountId: string;
  linkLabel: string;
  status: string;
  note: string;
  lines: SupplyOrderLineDetail[];
  createdAt: string;
  updatedAt: string;
};

export type QueueIssueEntry = {
  kind: "issue";
  id: number;
  linkId: number;
  accountId: string;
  linkLabel: string;
  status: string;
  category: string;
  note: string;
  photos: string[];
  createdAt: string;
  resolvedAt: string | null;
};

export type QueueEntry = QueueOrderEntry | QueueIssueEntry;

export async function listQueue(filter: { status?: string } = {}): Promise<QueueEntry[]> {
  const sql = getSql();

  const orderRows = filter.status
    ? await sql`
        SELECT so.*, sl.account_id, sl.label AS link_label
        FROM supply_orders so
        JOIN site_links sl ON sl.id = so.link_id
        WHERE so.status = ${filter.status}
        ORDER BY so.created_at DESC
        LIMIT 300
      `
    : await sql`
        SELECT so.*, sl.account_id, sl.label AS link_label
        FROM supply_orders so
        JOIN site_links sl ON sl.id = so.link_id
        ORDER BY so.created_at DESC
        LIMIT 300
      `;

  const issueRows = filter.status
    ? await sql`
        SELECT si.*, sl.account_id, sl.label AS link_label
        FROM site_issues si
        JOIN site_links sl ON sl.id = si.link_id
        WHERE si.status = ${filter.status}
        ORDER BY si.created_at DESC
        LIMIT 300
      `
    : await sql`
        SELECT si.*, sl.account_id, sl.label AS link_label
        FROM site_issues si
        JOIN site_links sl ON sl.id = si.link_id
        ORDER BY si.created_at DESC
        LIMIT 300
      `;

  // Batched (2 extra queries total, not one per row) — fetch every line/
  // photo for all the orders/issues just loaded in one shot each, then
  // group in JS. Avoids an N+1 query pattern that would otherwise issue one
  // extra round trip per order and per issue (up to 300 each).
  const orderIds = orderRows.map((r) => (r as Record<string, unknown>).id as number);
  const linesByOrderId = new Map<number, SupplyOrderLineDetail[]>();
  if (orderIds.length > 0) {
    const lineRows = await sql`
      SELECT sol.order_id, sol.item_id, si.name AS item_name, si.unit, sol.qty
      FROM supply_order_lines sol
      JOIN supply_items si ON si.id = sol.item_id
      WHERE sol.order_id = ANY(${orderIds})
      ORDER BY si.sort_order ASC, si.name ASC
    `;
    for (const r of lineRows) {
      const row = r as Record<string, unknown>;
      const orderId = row.order_id as number;
      const detail: SupplyOrderLineDetail = {
        itemId: row.item_id as number,
        itemName: row.item_name as string,
        unit: row.unit as string,
        qty: row.qty as number,
      };
      if (!linesByOrderId.has(orderId)) linesByOrderId.set(orderId, []);
      linesByOrderId.get(orderId)!.push(detail);
    }
  }

  const issueIds = issueRows.map((r) => (r as Record<string, unknown>).id as number);
  const photosByIssueId = new Map<number, string[]>();
  if (issueIds.length > 0) {
    const photoRows = await sql`
      SELECT issue_id, blob_url FROM site_issue_photos
      WHERE issue_id = ANY(${issueIds})
      ORDER BY created_at ASC
    `;
    for (const r of photoRows) {
      const row = r as Record<string, unknown>;
      const issueId = row.issue_id as number;
      if (!photosByIssueId.has(issueId)) photosByIssueId.set(issueId, []);
      photosByIssueId.get(issueId)!.push(row.blob_url as string);
    }
  }

  const orders: QueueOrderEntry[] = orderRows.map((r) => {
    const row = r as Record<string, unknown>;
    const id = row.id as number;
    return {
      kind: "order" as const,
      id,
      linkId: row.link_id as number,
      accountId: row.account_id as string,
      linkLabel: row.link_label as string,
      status: row.status as string,
      note: (row.note as string) ?? "",
      lines: linesByOrderId.get(id) ?? [],
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  });

  const issues: QueueIssueEntry[] = issueRows.map((r) => {
    const row = r as Record<string, unknown>;
    const id = row.id as number;
    return {
      kind: "issue" as const,
      id,
      linkId: row.link_id as number,
      accountId: row.account_id as string,
      linkLabel: row.link_label as string,
      status: row.status as string,
      category: row.category as string,
      note: (row.note as string) ?? "",
      photos: photosByIssueId.get(id) ?? [],
      createdAt: toIso(row.created_at),
      resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
    };
  });

  return [...orders, ...issues].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
