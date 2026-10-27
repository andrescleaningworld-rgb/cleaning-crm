"use client";

// "⬇ Download PDF" for supply orders: asks the server for the Supply Order PDF
// (GET /api/supply-orders/pdf) and saves it on this device as
// Supply_Order_<Account>_<Date>.pdf. Used by the order cards (Supplies home and
// Supply Orders), the many-at-once bar and the print page.

const TIMEOUT_MS = 45_000;

export const supplyOrderPdfUrl = (keys: string[]) => `/api/supply-orders/pdf?${keys.map((key) => `o=${encodeURIComponent(key)}`).join("&")}`;

/** Throws with a message to show when it could not be made or saved. */
export async function downloadSupplyOrderPdf(keys: string[]): Promise<void> {
  if (keys.length === 0) throw new Error("Pick an order first.");
  // Not fetchWithTimeout: that reads the answer as text, which would spoil a PDF.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(supplyOrderPdfUrl(keys), { cache: "no-store", signal: controller.signal });
  } catch {
    throw new Error(controller.signal.aborted ? "That took too long, try again." : "No connection. Try again.");
  } finally {
    window.clearTimeout(timer);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "The PDF could not be made. Try again.");
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "Supply_Order.pdf";
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
