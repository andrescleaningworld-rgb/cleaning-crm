"use client";

import React, { useState, useCallback } from "react";
import type { MergedPortalAccount } from "@/lib/data/customer-portal";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  SearchBar,
  SelectField,
  Sheet,
  StatusPill,
  type StatusKind,
} from "@/app/ui";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ui-btn ui-btn-quiet"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function statusKind(status: string): StatusKind {
  const s = status.toLowerCase();
  return s === "active" ? "done" : s === "cancelled" || s === "canceled" ? "needs-you" : "off";
}

function StatusBadge({ status }: { status: string }) {
  return <StatusPill kind={statusKind(status)}>{status || "No status"}</StatusPill>;
}

function AccessBadge({ account }: { account: MergedPortalAccount }) {
  if (account.portalSheetRow === null) return <StatusPill kind="off">Not set up</StatusPill>;
  return account.portalAccess === "YES" ? <StatusPill kind="done">Enabled</StatusPill> : <StatusPill kind="off">Disabled</StatusPill>;
}

type EditState = {
  phone: string;
  nextScheduledService: string;
  estimatedMonthlyTotal: string;
};

export default function PortalTable({ initial }: { initial: MergedPortalAccount[] }) {
  const [accounts, setAccounts] = useState<MergedPortalAccount[]>(initial);
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ phone: "", nextScheduledService: "", estimatedMonthlyTotal: "" });
  const [loadingRow, setLoadingRow] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/portal-accounts");
    if (res.ok) {
      const data = await res.json() as MergedPortalAccount[];
      setAccounts(data);
    }
  }, []);

  const filtered = accounts.filter((a) => {
    if (search && !a.accountName.toLowerCase().includes(search.toLowerCase())) return false;
    if (accessFilter === "enabled" && a.portalAccess !== "YES") return false;
    if (accessFilter === "disabled" && (a.portalAccess !== "NO" || a.portalSheetRow === null)) return false;
    if (statusFilter === "active" && a.accountStatus.toLowerCase() !== "active") return false;
    if (statusFilter === "inactive" && a.accountStatus.toLowerCase() === "active") return false;
    return true;
  });

  const enabledCount = accounts.filter((a) => a.portalAccess === "YES").length;

  function openEdit(a: MergedPortalAccount) {
    setExpandedRow(a.accountName);
    setEditState({
      phone: a.portalPhone || a.mainPhone,
      nextScheduledService: a.nextScheduledService,
      estimatedMonthlyTotal: a.estimatedMonthlyTotal,
    });
    setError("");
  }

  async function handleEnable(a: MergedPortalAccount) {
    setLoadingRow(a.accountName);
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: a.accountName, phone: a.mainPhone, accountId: a.mainAccountId }),
      });
      const data = await res.json() as { portalCode?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await refetch();
      // Auto-open the edit panel after enabling
      const fresh = await fetch("/api/admin/portal-accounts").then((r) => r.json()) as MergedPortalAccount[];
      setAccounts(fresh);
      const updated = fresh.find((x) => x.accountName === a.accountName);
      if (updated) {
        setExpandedRow(a.accountName);
        setEditState({ phone: updated.portalPhone || updated.mainPhone, nextScheduledService: "", estimatedMonthlyTotal: "" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleToggleAccess(a: MergedPortalAccount) {
    if (!a.portalSheetRow) return;
    setLoadingRow(a.accountName);
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: a.portalSheetRow, action: "toggleAccess", currentAccess: a.portalAccess }),
      });
      const data = await res.json() as { portalAccess?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAccounts((prev) => prev.map((x) => x.accountName === a.accountName
        ? { ...x, portalAccess: data.portalAccess as "YES" | "NO" } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleGenerateCode(a: MergedPortalAccount) {
    if (!a.portalSheetRow) return;
    setLoadingRow(a.accountName + "-code");
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: a.portalSheetRow, action: "generateCode" }),
      });
      const data = await res.json() as { portalCode?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAccounts((prev) => prev.map((x) => x.accountName === a.accountName
        ? { ...x, portalCode: data.portalCode ?? "" } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleSaveFields(a: MergedPortalAccount) {
    if (!a.portalSheetRow) return;
    setLoadingRow(a.accountName + "-save");
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: a.portalSheetRow,
          action: "updateFields",
          fields: {
            phone: editState.phone,
            nextScheduledService: editState.nextScheduledService,
            estimatedMonthlyTotal: editState.estimatedMonthlyTotal,
          },
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAccounts((prev) => prev.map((x) => x.accountName === a.accountName
        ? { ...x, portalPhone: editState.phone, nextScheduledService: editState.nextScheduledService, estimatedMonthlyTotal: editState.estimatedMonthlyTotal }
        : x));
      setExpandedRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  const editing = expandedRow ? accounts.find((a) => a.accountName === expandedRow && a.portalSheetRow !== null) ?? null : null;
  const codeLoading = editing ? loadingRow === editing.accountName + "-code" : false;
  const saveLoading = editing ? loadingRow === editing.accountName + "-save" : false;

  function actions(account: MergedPortalAccount) {
    const rowLoading = loadingRow === account.accountName;
    const active = account.portalAccess === "YES";
    if (account.portalSheetRow === null) {
      return (
        <BigButton kind="second" busy={rowLoading} busyLabel="Enabling…" onClick={() => handleEnable(account)}>
          Enable
        </BigButton>
      );
    }
    return (
      <>
        <BigButton kind="second" onClick={() => openEdit(account)}>
          Edit
        </BigButton>
        <BigButton kind={active ? "danger" : "second"} busy={rowLoading} busyLabel="Saving…" onClick={() => handleToggleAccess(account)}>
          {active ? "Disable" : "Enable"}
        </BigButton>
      </>
    );
  }

  const code = (account: MergedPortalAccount) =>
    account.portalCode ? (
      <span className="ui-code-row">
        <span className="ui-code">{account.portalCode}</span>
        <CopyButton text={account.portalCode} />
      </span>
    ) : (
      <span className="ui-muted">no code</span>
    );

  return (
    <div className="ui-stack">
      {/* Stats */}
      <div className="ui-stats">
        <div className="ui-stat">
          <p className="ui-stat-label">Total Accounts</p>
          <p className="ui-stat-value">{accounts.length}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Portal Enabled</p>
          <p className="ui-stat-value">{enabledCount}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Not Enabled</p>
          <p className="ui-stat-value">{accounts.length - enabledCount}</p>
        </div>
      </div>

      {error && !editing ? <ErrorBox title={error} /> : null}

      {/* Filters */}
      <SearchBar value={search} onChange={setSearch} label="Search accounts" placeholder="Search accounts" />
      <div className="ui-two">
        <SelectField label="Portal access" value={accessFilter} onChange={(e) => setAccessFilter(e.target.value as typeof accessFilter)} required={false}>
          <option value="all">All Access</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Not Enabled</option>
        </SelectField>
        <SelectField label="Account status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} required={false}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
      </div>
      <p className="ui-muted">{filtered.length} of {accounts.length}</p>

      {/* List: cards on a phone, a table on a wide screen */}
      {filtered.length === 0 ? (
        <EmptyState icon="search" title={search ? "No accounts match your search." : "No accounts found."} />
      ) : (
        <CardList
          label="Accounts"
          items={filtered.map((account, idx) => ({ account, key: `${account.accountName}-${idx}` }))}
          getKey={(item) => item.key}
          renderCard={({ account }) => (
            <Card title={account.accountName} right={<AccessBadge account={account} />}>
              <p>{account.serviceType || "No service type"}</p>
              <p><StatusBadge status={account.accountStatus} /></p>
              <p>{code(account)}</p>
              <div className="ui-actions-row">{actions(account)}</div>
            </Card>
          )}
          columns={[
            { header: "Account Name", cell: ({ account }) => <span className="ui-strong">{account.accountName}</span> },
            { header: "Service Type", cell: ({ account }) => account.serviceType || "No service type" },
            { header: "Status", cell: ({ account }) => <StatusBadge status={account.accountStatus} /> },
            { header: "Portal Code", cell: ({ account }) => code(account) },
            { header: "Access", cell: ({ account }) => <AccessBadge account={account} /> },
            { header: "Actions", cell: ({ account }) => <div className="ui-actions-row">{actions(account)}</div> },
          ]}
        />
      )}

      {/* Edit */}
      <Sheet
        open={editing !== null}
        title={editing ? `Edit Portal Settings: ${editing.accountName}` : ""}
        onClose={() => setExpandedRow(null)}
        busy={saveLoading}
        actions={
          editing ? (
            <BigButton busy={saveLoading} busyLabel="Saving…" onClick={() => handleSaveFields(editing)}>
              Save Changes
            </BigButton>
          ) : undefined
        }
      >
        {editing ? (
          <div className="ui-stack">
            <Field
              label="Phone Number"
              optional
              type="tel"
              value={editState.phone}
              onChange={(e) => setEditState((s) => ({ ...s, phone: e.target.value }))}
              placeholder={editing.mainPhone || "(201) 555-1234"}
            />
            <Field
              label="Next Scheduled Service"
              optional
              type="text"
              value={editState.nextScheduledService}
              onChange={(e) => setEditState((s) => ({ ...s, nextScheduledService: e.target.value }))}
              placeholder="e.g. 07/01/2026"
            />
            <Field
              label="Estimated Monthly Total"
              optional
              type="text"
              value={editState.estimatedMonthlyTotal}
              onChange={(e) => setEditState((s) => ({ ...s, estimatedMonthlyTotal: e.target.value }))}
              placeholder="e.g. 1250.00"
            />

            {/* Portal Code row */}
            <div className="ui-stack">
              <p className="ui-label">Portal Code</p>
              <p>{code(editing)}</p>
              <BigButton kind="second" busy={codeLoading} busyLabel="Generating…" onClick={() => handleGenerateCode(editing)}>
                Generate New Code
              </BigButton>
              <p className="ui-muted">Generating a new code will invalidate the old one.</p>
            </div>

            {error ? <ErrorBox title={error} /> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
