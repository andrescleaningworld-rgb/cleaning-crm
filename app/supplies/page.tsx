"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BigButton,
  Card,
  CardList,
  ConfirmSheet,
  EmptyState,
  ErrorBox,
  Field,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  TextAreaField,
  showToast,
  type StatusKind,
} from "@/app/ui";

type SupplyItem = {
  id?: string;
  ID?: string;
  supplyId?: string;
  "Supply ID"?: string;

  supplyItem?: string;
  item?: string;
  itemName?: string;
  name?: string;
  "Supply Item"?: string;

  category?: string;
  Category?: string;

  description?: string;
  itemDescription?: string;
  Description?: string;
  "Item Description"?: string;
  "Supply Description"?: string;

  unit?: string;
  Unit?: string;

  status?: string;
  Status?: string;
  "Supply Status"?: string;
  "Item Status"?: string;

  active?: string;
  Active?: string;

  currentStock?: string;
  CurrentStock?: string;
  "Current Stock"?: string;
  "current stock"?: string;
  stock?: string;

  minimumStock?: string;
  MinimumStock?: string;
  "Minimum Stock"?: string;
  minStock?: string;

  notes?: string;
  Notes?: string;

  lastUpdated?: string;
  LastUpdated?: string;
  "Last Updated"?: string;

  rowNumber?: number;
};

type SuppliesApiResponse = {
  success?: boolean;
  error?: string;
  supplyItems?: SupplyItem[];
  supplies?: SupplyItem[];
  data?: SupplyItem[];
};

type SupplyForm = {
  supplyId: string;
  rowNumber: string;
  supplyItem: string;
  category: string;
  description: string;
  unit: string;
  status: string;
  active: string;
  currentStock: string;
  minimumStock: string;
  notes: string;
};

const supplyCategories = [
  "Paper",
  "Trash Bags",
  "Soap",
  "Chemicals / Cleaners",
  "Equipment",
  "Tools",
  "Floor Care",
  "Wax / Stripper",
  "Misc",
  "Other / Needs Review",
];

const supplyStatuses = [
  "Active",
  "Inactive",
  "Office Only",
  "Discontinued",
  "Needs Review",
];

const emptyForm: SupplyForm = {
  supplyId: "",
  rowNumber: "",
  supplyItem: "",
  category: "",
  description: "",
  unit: "",
  status: "Active",
  active: "yes",
  currentStock: "",
  minimumStock: "",
  notes: "",
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function getSupplyId(item: SupplyItem) {
  return item.supplyId || item.id || item.ID || item["Supply ID"] || "";
}

function getSupplyName(item: SupplyItem) {
  return (
    item.supplyItem ||
    item["Supply Item"] ||
    item.item ||
    item.itemName ||
    item.name ||
    "Unnamed Supply"
  );
}

function getCategory(item: SupplyItem) {
  return item.category || item.Category || "";
}

function getDescription(item: SupplyItem) {
  return (
    item.description ||
    item.itemDescription ||
    item.Description ||
    item["Item Description"] ||
    item["Supply Description"] ||
    ""
  );
}

function getUnit(item: SupplyItem) {
  return item.unit || item.Unit || "";
}

function getStatus(item: SupplyItem) {
  return (
    item.status ||
    item.Status ||
    item["Supply Status"] ||
    item["Item Status"] ||
    ""
  );
}

function getActive(item: SupplyItem) {
  return item.active || item.Active || "";
}

function getAvailabilityStatus(item: SupplyItem) {
  const status = cleanText(getStatus(item));
  if (status) return status;

  const active = cleanLower(getActive(item));

  if (["yes", "true", "active", "y"].includes(active)) return "Active";
  if (["no", "false", "inactive", "n", "disabled", "removed"].includes(active)) {
    return "Inactive";
  }

  return "Active";
}

function getCurrentStock(item: SupplyItem) {
  return (
    item.currentStock ||
    item.CurrentStock ||
    item["Current Stock"] ||
    item["current stock"] ||
    item.stock ||
    ""
  );
}

function getMinimumStock(item: SupplyItem) {
  return (
    item.minimumStock ||
    item.MinimumStock ||
    item["Minimum Stock"] ||
    item.minStock ||
    ""
  );
}

function getNotes(item: SupplyItem) {
  return item.notes || item.Notes || "";
}

function getLastUpdated(item: SupplyItem) {
  return item.lastUpdated || item.LastUpdated || item["Last Updated"] || "";
}

function getLoadedSupplyItems(data: SuppliesApiResponse | SupplyItem[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.supplyItems)) return data.supplyItems;
  if (Array.isArray(data.supplies)) return data.supplies;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function isActiveSupply(item: SupplyItem) {
  const status = cleanLower(getAvailabilityStatus(item));

  return ![
    "no",
    "inactive",
    "false",
    "disabled",
    "removed",
    "discontinued",
  ].includes(status);
}

function isLowStock(item: SupplyItem) {
  const current = Number(cleanText(getCurrentStock(item)).replace(/,/g, ""));
  const minimum = Number(cleanText(getMinimumStock(item)).replace(/,/g, ""));

  if (Number.isNaN(current) || Number.isNaN(minimum)) return false;
  if (minimum <= 0) return false;

  return current <= minimum;
}

function statusKind(statusValue: string): StatusKind {
  const status = cleanLower(statusValue);

  if (status === "active") return "done";
  if (status === "office only" || status === "needs review") return "waiting";
  return "off";
}

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SupplyForm>(emptyForm);
  const [removing, setRemoving] = useState<SupplyItem | null>(null);

  async function loadSupplies() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/supplies?action=getSupplyItemsAdmin");

      const data = (await res.json()) as SuppliesApiResponse | SupplyItem[];

      if (!res.ok || (!Array.isArray(data) && data.success === false)) {
        throw new Error(
          !Array.isArray(data) && data.error
            ? data.error
            : "Failed to load supplies."
        );
      }

      setSupplies(getLoadedSupplyItems(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSupplies();
  }, []);

  const filteredSupplies = useMemo(() => {
    const q = search.toLowerCase().trim();

    if (!q) return supplies;

    return supplies.filter((item) => {
      return [
        getSupplyId(item),
        getSupplyName(item),
        getCategory(item),
        getDescription(item),
        getUnit(item),
        getAvailabilityStatus(item),
        getActive(item),
        getCurrentStock(item),
        getMinimumStock(item),
        getNotes(item),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [supplies, search]);

  function updateForm(field: keyof SupplyForm, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(false);
  }

  function startAdd() {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(true);
    setSuccessMessage("");
    setError("");
  }

  function startEdit(item: SupplyItem) {
    const status = getAvailabilityStatus(item);
    const active = getActive(item) || (cleanLower(status) === "active" ? "yes" : "no");

    setForm({
      supplyId: getSupplyId(item),
      rowNumber: item.rowNumber ? String(item.rowNumber) : "",
      supplyItem: getSupplyName(item),
      category: getCategory(item),
      description: getDescription(item),
      unit: getUnit(item),
      status,
      active,
      currentStock: getCurrentStock(item),
      minimumStock: getMinimumStock(item),
      notes: getNotes(item),
    });

    setEditing(true);
    setShowForm(true);
    setSuccessMessage("");
    setError("");
  }

  async function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    if (!form.supplyItem.trim()) {
      setError("Type the supply item's name.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const action = editing ? "updateSupplyItem" : "addSupplyItem";

      const res = await fetch("/api/supplies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...form,
          itemDescription: form.description,
          rowNumber: form.rowNumber ? Number(form.rowNumber) : undefined,
        }),
      });

      const data = (await res.json()) as SuppliesApiResponse;

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to save supply item.");
      }

      const message = editing
        ? "Supply item updated successfully."
        : "Supply item added successfully.";
      setSuccessMessage(message);
      showToast(message);

      resetForm();
      await loadSupplies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item: SupplyItem) {
    const supplyName = getSupplyName(item);

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const res = await fetch("/api/supplies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "deactivateSupplyItem",
          supplyId: getSupplyId(item),
          supplyItem: supplyName,
          rowNumber: item.rowNumber,
          status: "Inactive",
          active: "no",
        }),
      });

      const data = (await res.json()) as SuppliesApiResponse;

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to remove supply item.");
      }

      setSuccessMessage("Supply item deactivated successfully.");
      await loadSupplies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = supplies.filter(isActiveSupply).length;
  const inactiveCount = supplies.length - activeCount;
  const lowStockCount = supplies.filter(isLowStock).length;

  // Later we can connect this to the real Supply Orders tab.
  // For now, the button is ready but will not show a badge unless this number is above 0.
  const newSupplyOrdersCount = 0;

  const formError = showForm ? error : "";

  const stock = (item: SupplyItem) => (
    <>
      {getCurrentStock(item) || "-"}
      {isLowStock(item) ? <> <StatusPill kind="needs-you">Low</StatusPill></> : null}
    </>
  );

  const actions = (item: SupplyItem) => (
    <div className="ui-actions-row">
      <BigButton kind="second" onClick={() => startEdit(item)}>
        Edit
      </BigButton>
      {isActiveSupply(item) ? (
        <BigButton kind="danger" disabled={saving} onClick={() => setRemoving(item)}>
          Remove
        </BigButton>
      ) : null}
    </div>
  );

  return (
    <Screen
      title="Supplies"
      subtitle="Manage the supply list used by the subcontractor portal."
      headerRight={
        <BigButton kind="second" href="/supply-orders">
          {newSupplyOrdersCount > 0 ? `Supply Orders (${newSupplyOrdersCount})` : "Supply Orders"}
        </BigButton>
      }
      action={
        <BigButton icon="plus" onClick={startAdd}>
          Add Supply
        </BigButton>
      }
    >
      <div className="ui-stats">
        <div className="ui-stat">
          <p className="ui-stat-label">Active Supplies</p>
          <p className="ui-stat-value">{activeCount}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Inactive Supplies</p>
          <p className="ui-stat-value">{inactiveCount}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Low Stock</p>
          <p className="ui-stat-value">{lowStockCount}</p>
        </div>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        label="Search supplies"
        placeholder="Search by item, category, description, status"
      />

      {successMessage ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {successMessage}
        </p>
      ) : null}

      {error && !showForm ? <ErrorBox title={error} onRetry={supplies.length === 0 ? loadSupplies : undefined} /> : null}

      <section className="ui-stack">
        <div className="ui-card-row">
          <h2 className="ui-card-title">Supply List</h2>
          <p className="ui-muted">{filteredSupplies.length} shown</p>
        </div>

        {loading ? (
          <SkeletonList rows={4} />
        ) : filteredSupplies.length === 0 ? (
          <EmptyState icon="search" title="No supplies found." />
        ) : (
          <CardList
            label="Supplies"
            items={filteredSupplies.map((item, index) => ({ item, key: getSupplyId(item) || `${getSupplyName(item)}-${index}` }))}
            getKey={(entry) => entry.key}
            renderCard={({ item }) => (
              <Card title={getSupplyName(item)} right={<StatusPill kind={statusKind(getAvailabilityStatus(item))}>{getAvailabilityStatus(item)}</StatusPill>}>
                {getDescription(item) ? <p>{getDescription(item)}</p> : null}
                {getNotes(item) ? <p className="ui-muted">Notes: {getNotes(item)}</p> : null}
                <dl className="ui-details">
                  <div className="ui-detail">
                    <dt>Category</dt>
                    <dd>{getCategory(item) || "-"}</dd>
                  </div>
                  <div className="ui-detail">
                    <dt>Unit</dt>
                    <dd>{getUnit(item) || "-"}</dd>
                  </div>
                  <div className="ui-detail">
                    <dt>Stock</dt>
                    <dd>{stock(item)}</dd>
                  </div>
                  <div className="ui-detail">
                    <dt>Minimum</dt>
                    <dd>{getMinimumStock(item) || "-"}</dd>
                  </div>
                  <div className="ui-detail">
                    <dt>Last Updated</dt>
                    <dd>{getLastUpdated(item) || "-"}</dd>
                  </div>
                </dl>
                {actions(item)}
              </Card>
            )}
            columns={[
              {
                header: "Supply",
                cell: ({ item }) => (
                  <>
                    <span className="ui-strong">{getSupplyName(item)}</span>
                    {getDescription(item) ? <span className="ui-muted block ui-clamp">{getDescription(item)}</span> : null}
                    {getNotes(item) ? <span className="ui-muted block ui-clamp">Notes: {getNotes(item)}</span> : null}
                  </>
                ),
              },
              { header: "Category", cell: ({ item }) => getCategory(item) || "-" },
              { header: "Unit", cell: ({ item }) => getUnit(item) || "-" },
              { header: "Stock", cell: ({ item }) => stock(item) },
              { header: "Minimum", cell: ({ item }) => getMinimumStock(item) || "-" },
              { header: "Status", cell: ({ item }) => <StatusPill kind={statusKind(getAvailabilityStatus(item))}>{getAvailabilityStatus(item)}</StatusPill> },
              { header: "Last Updated", cell: ({ item }) => getLastUpdated(item) || "-" },
              { header: "Actions", cell: ({ item }) => actions(item) },
            ]}
          />
        )}
      </section>

      <Sheet
        open={showForm}
        title={editing ? "Edit Supply" : "Add Supply"}
        onClose={resetForm}
        busy={saving}
        actions={
          <BigButton busy={saving} busyLabel="Saving..." onClick={() => handleSubmit()}>
            {editing ? "Update Supply" : "Save Supply"}
          </BigButton>
        }
      >
        <div className="ui-stack">
          <Field label="Supply Item" value={form.supplyItem} onChange={(e) => updateForm("supplyItem", e.target.value)} />

          <SelectField label="Category" optional value={form.category} onChange={(e) => updateForm("category", e.target.value)}>
            <option value="">Select category</option>
            {/* A category typed by hand in the sheet stays selectable. */}
            {form.category && !supplyCategories.includes(form.category) ? <option value={form.category}>{form.category}</option> : null}
            {supplyCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </SelectField>

          <TextAreaField
            label="Description"
            optional
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            rows={3}
            placeholder="Short description so the office and subcontractors know exactly what this item is."
          />

          <Field
            label="Unit"
            optional
            value={form.unit}
            onChange={(e) => updateForm("unit", e.target.value)}
            placeholder="Case, box, gallon, each..."
          />

          <SelectField
            label="Status"
            hint="Active shows in the subcontractor portal. Office Only and Needs Review can be used internally."
            value={form.status}
            onChange={(e) => {
              const status = e.target.value;
              updateForm("status", status);
              updateForm("active", cleanLower(status) === "active" ? "yes" : "no");
            }}
          >
            {!supplyStatuses.includes(form.status) && form.status ? <option value={form.status}>{form.status}</option> : null}
            {supplyStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </SelectField>

          <div className="ui-two">
            <Field label="Current Stock" optional type="number" min="0" value={form.currentStock} onChange={(e) => updateForm("currentStock", e.target.value)} />
            <Field label="Minimum Stock" optional type="number" min="0" value={form.minimumStock} onChange={(e) => updateForm("minimumStock", e.target.value)} />
          </div>

          <TextAreaField label="Notes" optional value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} rows={4} />

          {formError ? <ErrorBox title={formError} /> : null}
        </div>
      </Sheet>

      <ConfirmSheet
        open={removing !== null}
        title={removing ? `Remove ${getSupplyName(removing)}?` : ""}
        text="This takes it off the active supply list. It will deactivate it, not delete history."
        confirmLabel="Remove"
        busy={saving}
        busyLabel="Removing..."
        onConfirm={async () => {
          if (removing) await handleDeactivate(removing);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
