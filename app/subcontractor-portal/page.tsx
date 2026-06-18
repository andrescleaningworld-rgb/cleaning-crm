"use client";

import { FormEvent, useMemo, useState } from "react";

type Account = {
  id?: string;
  accountId?: string;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  subcontractor?: string;
  status?: string;
};

type SupplyItem = {
  rowNumber?: number;
  supplyItem?: string;
  category?: string;
  description?: string;
  itemDescription?: string;
  unit?: string;
  notes?: string;
  active?: string;
  status?: string;
};

type Subcontractor = {
  id?: string;
  subcontractorId?: string;
  name?: string;
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  status?: string;
};

type PortalResponse = {
  success: boolean;
  message?: string;
  error?: string;
  subcontractor?: Subcontractor | null;
  accounts?: Account[];
  supplyItems?: SupplyItem[];
  orderId?: string | null;
};

type OrderLineItem = {
  id: string;
  category: string;
  supplyItem: string;
  customItemName: string;
  itemDescription: string;
  quantity: string;
};

const OTHER_ITEM_VALUE = "__OTHER_NOT_LISTED__";
const OTHER_CATEGORY_VALUE = "Other / Needs Review";

function makeLineItem(): OrderLineItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    category: "",
    supplyItem: "",
    customItemName: "",
    itemDescription: "",
    quantity: "",
  };
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanLower(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function isActiveAccount(account: Account) {
  const status = cleanLower(account.status);

  if (!status) return true;

  return ![
    "cancelled",
    "canceled",
    "inactive",
    "paused",
    "lost",
    "terminated",
    "closed",
    "duplicate",
    "old",
    "archive",
    "archived",
  ].some((badStatus) => status.includes(badStatus));
}

function getSupplyName(item: SupplyItem) {
  return cleanText(item.supplyItem);
}

function getSupplyCategory(item: SupplyItem) {
  return cleanText(item.category);
}

function getSupplyDescription(item: SupplyItem) {
  return cleanText(item.description || item.itemDescription || item.notes);
}

function getSupplyUnit(item: SupplyItem) {
  return cleanText(item.unit);
}

function getSupplyStatus(item: SupplyItem) {
  return cleanText(item.status);
}

function getSupplyActive(item: SupplyItem) {
  return cleanText(item.active);
}

function isActiveSupply(item: SupplyItem) {
  const status = cleanLower(getSupplyStatus(item));
  const active = cleanLower(getSupplyActive(item));

  if (status) {
    return status === "active";
  }

  if (active) {
    return active === "yes" || active === "true" || active === "active";
  }

  return true;
}

function getSubcontractorDisplayName(subcontractor: Subcontractor) {
  return (
    subcontractor.subcontractorName ||
    subcontractor.companyName ||
    subcontractor.contactName ||
    subcontractor.name ||
    "Subcontractor"
  );
}

export default function SubcontractorPortalPage() {
  const [email, setEmail] = useState("");
  const [subcontractor, setSubcontractor] = useState<Subcontractor | null>(
    null
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);

  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [notes, setNotes] = useState("");
  const [orderItems, setOrderItems] = useState<OrderLineItem[]>([
    makeLineItem(),
  ]);

  const [loading, setLoading] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const activeAccounts = useMemo(() => {
    return accounts.filter(isActiveAccount);
  }, [accounts]);

  const activeSupplyItems = useMemo(() => {
    return supplyItems
      .filter(isActiveSupply)
      .filter((item) => getSupplyName(item) !== "");
  }, [supplyItems]);

  const supplyCategories = useMemo(() => {
    const categorySet = new Set<string>();

    activeSupplyItems.forEach((item) => {
      const category = getSupplyCategory(item);
      if (category) categorySet.add(category);
    });

    return Array.from(categorySet).sort((a, b) => a.localeCompare(b));
  }, [activeSupplyItems]);

  const selectedAccount = useMemo(() => {
    return activeAccounts.find(
      (account) => account.accountName === selectedAccountName
    );
  }, [activeAccounts, selectedAccountName]);

  function getFilteredSuppliesForLine(line: OrderLineItem) {
    if (!line.category || line.category === OTHER_CATEGORY_VALUE) {
      return activeSupplyItems;
    }

    return activeSupplyItems.filter((item) => {
      return getSupplyCategory(item) === line.category;
    });
  }

  function getSelectedSupplyForLine(line: OrderLineItem) {
    if (!line.supplyItem || line.supplyItem === OTHER_ITEM_VALUE) return null;

    return activeSupplyItems.find((item) => {
      return getSupplyName(item) === line.supplyItem;
    });
  }

  function updateLineItem(
    lineId: string,
    field: keyof OrderLineItem,
    value: string
  ) {
    setOrderItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== lineId) return item;

        if (field === "category") {
          return {
            ...item,
            category: value,
            supplyItem: value === OTHER_CATEGORY_VALUE ? OTHER_ITEM_VALUE : "",
            customItemName:
              value === OTHER_CATEGORY_VALUE ? item.customItemName : "",
            itemDescription:
              value === OTHER_CATEGORY_VALUE ? item.itemDescription : "",
            quantity: item.quantity,
          };
        }

        if (field === "supplyItem") {
          const selectedSupply = activeSupplyItems.find((supply) => {
            return getSupplyName(supply) === value;
          });

          return {
            ...item,
            supplyItem: value,
            customItemName: value === OTHER_ITEM_VALUE ? item.customItemName : "",
            itemDescription:
              value === OTHER_ITEM_VALUE
                ? item.itemDescription
                : getSupplyDescription(selectedSupply || {}),
          };
        }

        return {
          ...item,
          [field]: value,
        };
      })
    );
  }

  function addLineItem() {
    setOrderItems((currentItems) => [...currentItems, makeLineItem()]);
  }

  function removeLineItem(lineId: string) {
    setOrderItems((currentItems) => {
      if (currentItems.length === 1) return currentItems;
      return currentItems.filter((item) => item.id !== lineId);
    });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/subcontractor-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "getSubcontractorPortalByEmail",
          email: email.trim(),
        }),
      });

      const data = (await response.json()) as PortalResponse;

      if (!response.ok || !data.success) {
        setError(
          data.error ||
            data.message ||
            "We could not load the subcontractor portal."
        );
        setSubcontractor(null);
        setAccounts([]);
        setSupplyItems(data.supplyItems || []);
        return;
      }

      setSubcontractor(data.subcontractor || null);
      setAccounts(data.accounts || []);
      setSupplyItems(data.supplyItems || []);
      setSelectedAccountName("");
      setDeliveryMode("");
      setNotes("");
      setOrderItems([makeLineItem()]);

      if (!data.subcontractor) {
        setError("We could not find that email on file.");
        return;
      }

      setSuccessMessage("Portal loaded successfully.");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Unknown error loading portal."
      );
    } finally {
      setLoading(false);
    }
  }

  function validateOrder() {
    if (!subcontractor) {
      return "Please enter your subcontractor email first.";
    }

    if (!selectedAccountName) {
      return "Please select an account.";
    }

    if (!deliveryMode) {
      return "Please select pick up or deliver to account.";
    }

    if (orderItems.length === 0) {
      return "Please add at least one supply item.";
    }

    for (let index = 0; index < orderItems.length; index += 1) {
      const item = orderItems[index];
      const lineNumber = index + 1;
      const isOther = item.supplyItem === OTHER_ITEM_VALUE;

      if (!item.supplyItem) {
        return `Please select a supply item for item ${lineNumber}.`;
      }

      if (isOther && !item.customItemName.trim()) {
        return `Please enter the item name for Other / Not Listed item ${lineNumber}.`;
      }

      if (isOther && !item.itemDescription.trim()) {
        return `Please enter a description for Other / Not Listed item ${lineNumber}.`;
      }

      if (!item.quantity.trim()) {
        return `Please enter a quantity for item ${lineNumber}.`;
      }
    }

    return "";
  }

  async function handleSubmitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateOrder();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!subcontractor) return;

    setError("");
    setSuccessMessage("");
    setSubmittingOrder(true);

    const orderGroupId = `SUPORD-GROUP-${Date.now()}`;

    try {
      const submittedOrderIds: string[] = [];

      for (const lineItem of orderItems) {
        const isOther = lineItem.supplyItem === OTHER_ITEM_VALUE;
        const selectedSupply = getSelectedSupplyForLine(lineItem);

        const supplyItemName = isOther
          ? `Other / Not Listed - ${lineItem.customItemName.trim()}`
          : lineItem.supplyItem;

        const category = isOther
          ? OTHER_CATEGORY_VALUE
          : getSupplyCategory(selectedSupply || {}) || lineItem.category;

        const itemDescription = isOther
          ? lineItem.itemDescription.trim()
          : lineItem.itemDescription.trim() ||
            getSupplyDescription(selectedSupply || {});

        const unit = isOther ? "" : getSupplyUnit(selectedSupply || {});

        const response = await fetch("/api/subcontractor-portal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "submitSupplyOrder",
            orderGroupId,
            subcontractorEmail: subcontractor.email || email.trim(),
            subcontractorName: getSubcontractorDisplayName(subcontractor),
            accountId: selectedAccount?.accountId || selectedAccount?.id || "",
            accountName: selectedAccountName,
            supplyItem: supplyItemName,
            category,
            description: itemDescription,
            itemDescription,
            quantity: lineItem.quantity.trim(),
            unit,
            deliveryMode,
            notes: notes.trim(),
            status: isOther ? "Needs Review" : "New",
          }),
        });

        const data = (await response.json()) as PortalResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
              data.message ||
              `Failed to submit item: ${supplyItemName}`
          );
        }

        if (data.orderId) {
          submittedOrderIds.push(data.orderId);
        }
      }

      setSuccessMessage(
        submittedOrderIds.length > 0
          ? `Supply order submitted successfully. ${orderItems.length} item(s) sent.`
          : "Supply order submitted successfully."
      );

      setSelectedAccountName("");
      setDeliveryMode("");
      setNotes("");
      setOrderItems([makeLineItem()]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unknown error submitting order."
      );
    } finally {
      setSubmittingOrder(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-sky-500 p-6 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Subcontractor Supply Portal
          </h1>
          <p className="mt-3 text-sm leading-6 text-blue-50">
            Enter the email Cleaning World has on file. After your email is
            verified, you will only see your active assigned accounts.
          </p>
        </section>

        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-700">
                Subcontractor Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email on file"
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-blue-700 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Loading Portal..." : "Access Portal"}
            </button>
          </form>
        </section>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
            {successMessage}
          </div>
        ) : null}

        {subcontractor ? (
          <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Logged in as
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-900">
                {getSubcontractorDisplayName(subcontractor)}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {subcontractor.email}
              </p>
            </div>

            <form onSubmit={handleSubmitOrder} className="mt-5 space-y-5">
              <div>
                <label className="text-sm font-bold text-slate-700">
                  Account
                </label>
                <select
                  value={selectedAccountName}
                  onChange={(event) =>
                    setSelectedAccountName(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600"
                  required
                >
                  <option value="">Select account</option>
                  {activeAccounts.map((account) => (
                    <option
                      key={`${account.accountId || account.id || ""}-${
                        account.accountName || ""
                      }`}
                      value={account.accountName || ""}
                    >
                      {account.accountName}
                    </option>
                  ))}
                </select>

                {activeAccounts.length === 0 ? (
                  <p className="mt-2 text-sm font-semibold text-amber-700">
                    No active assigned accounts were found for this email.
                  </p>
                ) : null}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Supply Items
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Add one or multiple items for this account.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={addLineItem}
                    className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800"
                  >
                    + Add
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {orderItems.map((lineItem, index) => {
                    const selectedSupply = getSelectedSupplyForLine(lineItem);
                    const filteredSupplies = getFilteredSuppliesForLine(lineItem);
                    const isOther = lineItem.supplyItem === OTHER_ITEM_VALUE;
                    const selectedDescription = isOther
                      ? lineItem.itemDescription
                      : lineItem.itemDescription ||
                        getSupplyDescription(selectedSupply || {});
                    const selectedUnit = isOther
                      ? ""
                      : getSupplyUnit(selectedSupply || {});

                    return (
                      <div
                        key={lineItem.id}
                        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h4 className="font-black text-slate-900">
                            Item {index + 1}
                          </h4>

                          {orderItems.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeLineItem(lineItem.id)}
                              className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-bold text-slate-700">
                              Category
                            </label>
                            <select
                              value={lineItem.category}
                              onChange={(event) =>
                                updateLineItem(
                                  lineItem.id,
                                  "category",
                                  event.target.value
                                )
                              }
                              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600"
                            >
                              <option value="">All categories</option>
                              {supplyCategories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                              <option value={OTHER_CATEGORY_VALUE}>
                                Other / Not Listed
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="text-sm font-bold text-slate-700">
                              Supply Item
                            </label>
                            <select
                              value={lineItem.supplyItem}
                              onChange={(event) =>
                                updateLineItem(
                                  lineItem.id,
                                  "supplyItem",
                                  event.target.value
                                )
                              }
                              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600"
                              required
                            >
                              <option value="">Select supply item</option>
                              {filteredSupplies.map((item) => (
                                <option
                                  key={`${item.rowNumber || ""}-${getSupplyName(
                                    item
                                  )}`}
                                  value={getSupplyName(item)}
                                >
                                  {getSupplyDescription(item) || getSupplyName(item)}
                                </option>
                              ))}
                              <option value={OTHER_ITEM_VALUE}>
                                Other / Not Listed
                              </option>
                            </select>
                          </div>

                          {isOther ? (
                            <div>
                              <label className="text-sm font-bold text-slate-700">
                                Requested Item Name
                              </label>
                              <input
                                value={lineItem.customItemName}
                                onChange={(event) =>
                                  updateLineItem(
                                    lineItem.id,
                                    "customItemName",
                                    event.target.value
                                  )
                                }
                                placeholder="Example: wax, stripper, tool, equipment..."
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                                required
                              />
                            </div>
                          ) : null}

                          {selectedSupply && !isOther ? (
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                              <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                                Item Description
                              </p>

                              {selectedDescription ? (
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {selectedDescription}
                                </p>
                              ) : (
                                <p className="mt-2 text-sm leading-6 text-slate-500">
                                  No description is currently listed for this
                                  item.
                                </p>
                              )}
                            </div>
                          ) : null}

                          {isOther ? (
                            <div>
                              <label className="text-sm font-bold text-slate-700">
                                Describe Requested Item
                              </label>
                              <textarea
                                value={lineItem.itemDescription}
                                onChange={(event) =>
                                  updateLineItem(
                                    lineItem.id,
                                    "itemDescription",
                                    event.target.value
                                  )
                                }
                                rows={3}
                                placeholder="Describe exactly what is needed. Example: floor wax, stripper, equipment, tool, or special supply."
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                                required
                              />
                            </div>
                          ) : null}

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className="text-sm font-bold text-slate-700">
                                Quantity
                              </label>
                              <input
                                value={lineItem.quantity}
                                onChange={(event) =>
                                  updateLineItem(
                                    lineItem.id,
                                    "quantity",
                                    event.target.value
                                  )
                                }
                                placeholder="Example: 2"
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                                required
                              />
                            </div>

                            <div>
                              <label className="text-sm font-bold text-slate-700">
                                Unit
                              </label>
                              <input
                                value={selectedUnit}
                                readOnly
                                placeholder={
                                  isOther ? "Office will review" : "Auto-filled"
                                }
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-base text-slate-600"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">
                  Delivery Mode
                </label>
                <select
                  value={deliveryMode}
                  onChange={(event) => setDeliveryMode(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600"
                  required
                >
                  <option value="">Select delivery mode</option>
                  <option value="Pick Up">Pick Up</option>
                  <option value="Deliver to Account">Deliver to Account</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add any special instructions or notes"
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={submittingOrder}
                className="w-full rounded-2xl bg-blue-700 px-5 py-4 text-base font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingOrder ? "Submitting Order..." : "Submit Supply Order"}
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}