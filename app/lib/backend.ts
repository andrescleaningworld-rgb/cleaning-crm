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
  frequency?: string;
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
  try {
    const res = await fetch("/api/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getAccount", customerId: customerIdentifier }),
    });
    const data = await res.json();
    return data.account ? [data.account] : data.accounts || [];
  } catch {
    // Fallback mock for demo if script not ready
    return [
      {
        id: "demo-1",
        accountName: "Demo Customer Account",
        address: "123 Main St, Anytown USA",
        frequency: "Weekly",
        status: "Active",
      },
    ];
  }
}

export async function submitCustomerRequest(payload: {
  type: string;
  details: string;
  preferredDate?: string;
  accountName?: string;
  customerId?: string;
}) {
  try {
    const res = await fetch("/api/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitRequest", ...payload }),
    });
    return await res.json();
  } catch {
    console.log("[backend] Customer request (simulated):", payload);
    return { success: true, message: "Request logged (demo mode)", id: "req-" + Date.now() };
  }
}

export async function submitCustomerComplaint(payload: {
  issue: string;
  location?: string;
  urgency?: string;
  accountName?: string;
  customerId?: string;
  photoName?: string;
}) {
  try {
    const res = await fetch("/api/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submitComplaint", ...payload }),
    });
    return await res.json();
  } catch {
    console.log("[backend] Customer complaint (simulated):", payload);
    return { success: true, message: "Complaint received (demo mode)", id: "comp-" + Date.now() };
  }
}

export async function getCustomerHistory(customerId: string) {
  try {
    const res = await fetch("/api/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getHistory", customerId }),
    });
    const data = await res.json();
    return data.history || [];
  } catch {
    return [
      { id: "hist-1", type: "Service Visit", date: "2026-06-01", status: "Completed", notes: "Regular weekly clean" },
      { id: "hist-2", type: "Complaint", date: "2026-05-15", status: "Resolved", notes: "Restroom issue fixed" },
    ];
  }
}

export async function getCustomerRequests(customerId: string) {
  try {
    const res = await fetch("/api/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getRequests", customerId }),
    });
    const data = await res.json();
    return data.requests || [];
  } catch {
    return [];
  }
}

// Add more methods as features are built:
// - getServiceHistory(accountId)
// - requestDateChange(...)
// etc.

export function getGoogleMapsUrl(address: string | null | undefined): string {
  if (!address) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
