"use client";

// Staff "View as customer" (lib/portalPreview.ts): the bar on top of every
// portal screen while staff look at it as one account's customer. Never
// shown to a customer (the layout draws it only during a staff preview).
//   - which account, and that customers do not see this bar
//   - English / Español: the portal's own language choice
//   - another account: type part of its name, tap it (the preview switches)
//   - Exit preview: back to the account page
//   - Share this preview: a private 7-day link for someone with no login
//     (lib/portalPreviewLink.ts), with the share buttons of the invites
// Opened from a shared link (shared): the same bar with English / Español
// only: no account switcher, no Share, no Exit.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CrewLinkShare from "@/app/components/CrewLinkShare";
import { BigButton, ErrorBox, Field, Sheet, showToast } from "@/app/ui";
import { PORTAL_LANG_COOKIE, type PortalLang } from "./words";

type Option = { id: string; name: string };

/** The portal's own language choice (the same cookie as its English / Español button). */
function writeLang(next: PortalLang) {
  document.cookie = `${PORTAL_LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export default function PreviewBanner({ accountId, accountName, lang, shared }: { accountId: string; accountName: string; lang: PortalLang; shared: boolean }) {
  const router = useRouter();
  const [sharing, setSharing] = useState(false);
  const [accounts, setAccounts] = useState<Option[] | null>(null);
  const [query, setQuery] = useState("");
  const [switching, setSwitching] = useState(false);

  // The account list only when someone starts typing in the switcher.
  useEffect(() => {
    if (!switching || accounts) return;
    let alive = true;
    fetch("/api/accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] }) => {
        if (!alive) return;
        const rows = (data.accounts ?? data.data ?? [])
          .map((row) => ({ id: String(row.accountId ?? row.id ?? "").trim(), name: String(row.accountName ?? "").trim() }))
          .filter((row) => row.id && row.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        setAccounts(rows);
      })
      .catch(() => {
        if (alive) setAccounts([]);
      });
    return () => {
      alive = false;
    };
  }, [switching, accounts]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!accounts || !q) return [];
    return accounts.filter((account) => account.name.toLowerCase().includes(q)).slice(0, 8);
  }, [accounts, query]);

  const setLang = (next: PortalLang) => {
    writeLang(next);
    router.refresh();
  };

  const pill = (value: PortalLang, label: string) => (
    <button
      type="button"
      aria-pressed={lang === value}
      onClick={() => setLang(value)}
      style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 800, border: "2px solid #ffffff", background: lang === value ? "#ffffff" : "transparent", color: lang === value ? "#7c2d12" : "#ffffff" }}
    >
      {label}
    </button>
  );

  return (
    <div role="region" aria-label="Staff preview" style={{ position: "sticky", top: 0, zIndex: 80, background: "#c2410c", color: "#ffffff", padding: "10px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 16, lineHeight: 1.35 }}>
          👁 Preview: viewing as {accountName}. Customers can&apos;t see this banner.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {pill("en", "English")}
          {pill("es", "Español")}
          {shared ? null : (
            <>
          <button
            type="button"
            onClick={() => setSharing(true)}
            style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 800, border: "2px solid #ffffff", background: "transparent", color: "#ffffff" }}
          >
            Share this preview
          </button>
          <button
            type="button"
            onClick={() => setSwitching((on) => !on)}
            style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 800, border: "2px solid #ffffff", background: "transparent", color: "#ffffff" }}
          >
            Other account
          </button>
          <a href="/api/admin/portal-preview?exit=1" style={{ padding: "6px 14px", borderRadius: 999, fontWeight: 800, background: "#ffffff", color: "#7c2d12", textDecoration: "none" }}>
            Exit preview
          </a>
            </>
          )}
        </div>
      </div>
      {shared ? null : <SharePreview open={sharing} accountId={accountId} accountName={accountName} onClose={() => setSharing(false)} />}
      {switching && !shared ? (
        <div style={{ maxWidth: 960, margin: "10px auto 0", position: "relative" }}>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={accounts ? "Type part of an account name" : "Loading the accounts…"}
            aria-label="Find another account"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "none", fontSize: 16, color: "#1f2937" }}
          />
          {matches.length ? (
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, background: "#ffffff", borderRadius: 10, overflow: "hidden" }}>
              {matches.map((account) => (
                <li key={account.id}>
                  <a href={`/api/admin/portal-preview?accountId=${encodeURIComponent(account.id)}`} style={{ display: "block", padding: "10px 12px", color: "#1f2937", textDecoration: "none", borderBottom: "1px solid #e5e7eb" }}>
                    {account.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : query.trim() && accounts ? (
            <p style={{ margin: "6px 0 0" }}>No account with that name.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Share this preview": makes a private link to this account's read-only
 * portal (7 days; Turn off on the account page), then the invites' share
 * buttons: Copy, Text, QR code, and Email to an address typed here.
 */
function SharePreview({ open, accountId, accountName, onClose }: { open: boolean; accountId: string; accountName: string; onClose: () => void }) {
  const [link, setLink] = useState<{ url: string; endsAt: string } | null>(null);
  const [error, setError] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  // Each opening makes a new link.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLink(null);
    setError("");
    fetch("/api/admin/portal-preview-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make", accountId }) })
      .then((response) => response.json())
      .then((data: { success?: boolean; error?: string; url?: string; endsAt?: string }) => {
        if (!alive) return;
        if (data.success && data.url && data.endsAt) setLink({ url: data.url, endsAt: data.endsAt });
        else setError(data.error || "The link could not be made.");
      })
      .catch(() => {
        if (alive) setError("The link could not be made.");
      });
    return () => {
      alive = false;
    };
  }, [open, accountId]);

  const until = link ? new Date(link.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const message = link ? `Preview of the Cleaning World customer portal for ${accountName} (read only, works until ${until}):\n${link.url}` : "";

  async function email() {
    if (!link) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/portal-preview-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "email", accountId, url: link.url, to }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "The email was not sent.");
      showToast(`Preview link emailed to ${to.trim()} ✓`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The email was not sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} title="Share this preview" text={`${accountName}: the customer portal as the customer sees it, read only. No login needed.`} onClose={onClose} closeLabel="Close" busy={sending}>
      <div className="ui-stack">
        {!link && !error ? <p className="ui-muted">Making the link…</p> : null}
        {error && !link ? <ErrorBox title="No link" text={error} /> : null}
        {link ? (
          <>
            <p className="ui-card-text">
              Works until <strong>{until}</strong>. Only this account, nothing can be sent or changed. Turn it off any time on the account page (More → Preview links).
            </p>
            <Field label="Email to" type="email" inputMode="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@example.com" />
            <CrewLinkShare placeName={accountName} url={link.url} message={message} copyText={message} copyLabel="Copy" qrButtonLabel="QR code" qrNote="Scan to open the preview on a phone.">
              <button
                type="button"
                disabled={sending || !to.trim()}
                onClick={() => void email()}
                className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-700 px-4 text-lg font-bold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
              >
                <span className="text-2xl" aria-hidden="true">✉️</span> {sending ? "Sending…" : "Email"}
              </button>
            </CrewLinkShare>
            {error ? <p className="ui-field-error">{error}</p> : null}
            <BigButton kind="second" onClick={onClose}>
              Done
            </BigButton>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
