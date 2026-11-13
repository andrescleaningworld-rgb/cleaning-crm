// The choices on the Sales page's Add sale form and its Edit sheet, in one
// place so the two forms always offer the same ones.

export const SERVICE_TYPES = ["Extra Service", "Floor Work", "Carpet Cleaning", "Window Cleaning", "Power Washing", "High Dusting", "Recurring Increase", "Other"];

export const SELLERS = ["Andrés", "Greg", "Drew"];

export const SALE_STATUSES = ["Pending", "Approved", "Paid", "Cancelled"];

/** The list, plus the sale's own value first when it is not on it (an old sale), so editing never drops it. */
export function withCurrent(options: string[], current: string): string[] {
  const value = current.trim();
  return value && value !== "N/A" && !options.includes(value) ? [value, ...options] : options;
}
