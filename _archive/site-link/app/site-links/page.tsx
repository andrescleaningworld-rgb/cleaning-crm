"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Account = { id?: string; accountId?: string; accountName?: string };
type Subcontractor = {
  id?: string;
  subcontractorId?: string;
  companyName?: string;
  contactName?: string;
};

type SiteLink = {
  id: number;
  token: string;
  accountId: string;
  accountName: string;
  subId: string | null;
  label: string;
  active: boolean;
  createdAt: string;
  revokedAt: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function accountId(account: Account): string {
  return cleanText(account.id || account.accountId);
}

function subLabel(sub: Subcontractor): string {
  const contact = cleanText(sub.contactName);
  const company = cleanText(sub.companyName);
  if (contact && company) return `${contact} — ${company}`;
  return contact || company || cleanText(sub.id || sub.subcontractorId);
}

function subId(sub: Subcontractor): string {
  return cleanText(sub.id || sub.subcontractorId);
}

export default function SiteLinksPage() {
  const [links, setLinks] = useState<SiteLink[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [newAccountId, setNewAccountId] = useState("");
  const [newSubId, setNewSubId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadAll() {
    try {
      setLoading(true);
      const [linksRes, accountsRes, subsRes] = await Promise.all([
        fetch("/api/admin/site-links", { cache: "no-store" }),
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/subcontractors", { cache: "no-store" }),
      ]);
      const linksData = await linksRes.json();
      const accountsData = await accountsRes.json();
      const subsData = await subsRes.json();

      setLinks(linksData.links ?? []);
      setAccounts(accountsData.accounts ?? []);
      setSubcontractors(subsData.subcontractors ?? []);
    } catch {
      setError("Failed to load site links.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountId || !newLabel.trim()) return;

    try {
      setCreating(true);
      setError("");
      const res = await fetch("/api/admin/site-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          accountId: newAccountId,
          subId: newSubId || null,
          label: newLabel.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not create site link.");
      }
      setNewAccountId("");
      setNewSubId("");
      setNewLabel("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create site link.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSetActive(id: number, active: boolean) {
    try {
      const res = await fetch("/api/admin/site-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", id, active }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update link.");
    }
  }

  async function handleRegenerate(id: number) {
    try {
      const res = await fetch("/api/admin/site-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerateToken", id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate token.");
    }
  }

  function handleCopy(link: SiteLink) {
    const url = `${window.location.origin}/s/${link.token}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Site Supply Links</h1>
            <p className="mt-1 text-sm text-slate-600">
              No-login links for a sub&apos;s employee to order supplies or report site issues.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/site-links/supplies"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-50"
            >
              Supply Catalog
            </Link>
            <Link
              href="/site-links/queue"
              className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-blue-800"
            >
              Queue
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Create a new link</h2>
          <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Account</label>
              <select
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value)}
                required
                className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
              >
                <option value="">Select account</option>
                {accounts
                  .map((a) => ({ id: accountId(a), name: cleanText(a.accountName) }))
                  .filter((a) => a.id)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.id}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Subcontractor (optional)</label>
              <select
                value={newSubId}
                onChange={(e) => setNewSubId(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
              >
                <option value="">—</option>
                {subcontractors
                  .map((s) => ({ id: subId(s), label: subLabel(s) }))
                  .filter((s) => s.id)
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Site 14"
                required
                className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={creating}
                className="min-h-[44px] rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create Link"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">All links</h2>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-700">
                    <th className="px-3 py-2.5">Label</th>
                    <th className="px-3 py-2.5">Account</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Created</th>
                    <th className="px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {links.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        No site links yet.
                      </td>
                    </tr>
                  ) : (
                    links.map((link) => (
                      <tr key={link.id} className="border-b">
                        <td className="px-3 py-2.5 font-semibold">{link.label}</td>
                        <td className="px-3 py-2.5">{link.accountName}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              link.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {link.active ? "Active" : "Revoked"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {new Date(link.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopy(link)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {copiedId === link.id ? "Copied!" : "Copy Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetActive(link.id, !link.active)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {link.active ? "Revoke" : "Reactivate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRegenerate(link.id)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Regenerate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
