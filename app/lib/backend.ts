/**
 * Backend Abstraction Layer
 * 
 * This file defines the contract between the UI and the data source.
 * 
 * Current implementation: Proxies to Google Apps Script (Google Sheets).
 * Future: Will be replaced with calls to a real backend API / database.
 * 
 * Goal: Make it easy to swap the storage layer without rewriting pages and portals.
 */

export interface Account {
  id?: string;
  accountName?: string;
  address?: string;
  // ... other fields as needed
}

export interface Complaint {
  id?: string;
  accountId?: string;
  issue?: string;
  status?: string;
  // ...
}

// Current: calls our existing /api routes (which hit Google Script)
// Later: these can call fetch('/api/v2/...') or a real SDK.

export async function getAccountsForCustomer(customerIdentifier: string): Promise<Account[]> {
  // For now, reuse existing public-ish endpoint if available, or placeholder
  // In production this would be authenticated per customer.
  try {
    const res = await fetch('/api/accounts?action=getMapAccounts', { next: { revalidate: 120 } });
    const data = await res.json();
    return data.accounts || data.data || [];
  } catch {
    return [];
  }
}

export async function submitCustomerRequest(payload: {
  type: string;
  details: string;
  preferredDate?: string;
  accountName?: string;
}) {
  // Placeholder. Will eventually POST to a real endpoint or script action.
  console.log('[backend] Customer request (simulated):', payload);
  
  // For demo, we can call an existing route if it makes sense, or just return success.
  return { success: true, message: "Request logged (demo mode)" };
}

export async function submitCustomerComplaint(payload: {
  issue: string;
  location?: string;
  urgency?: string;
  accountName?: string;
}) {
  console.log('[backend] Customer complaint (simulated):', payload);
  return { success: true, message: "Complaint received (demo mode)" };
}

// Add more methods as features are built:
// - getServiceHistory(accountId)
// - requestDateChange(...)
// etc.

export function getGoogleMapsUrl(address: string | null | undefined): string {
  if (!address) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
