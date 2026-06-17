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
  unit?: string;
  notes?: string;
  active?: string;
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

function isActiveAccount(account: Account) {
  const status = String(account.status || "").toLowerCase().trim();

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

export default function SubcontractorPortalPage() {
  const [email, setEmail] = useState("");
  const [subcontractor, setSubcontractor] = useState<Subcontractor | null>(
    null
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);

  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [selectedSupplyItem, setSelectedSupplyItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const activeAccounts = useMemo(() => {
    return accounts.filter(isActiveAccount);
  }, [accounts]);

  const selectedAccount = useMemo(() => {
    return activeAccounts.find(
      (account) => account.accountName === selectedAccountName
    );
  }, [activeAccounts, selectedAccountName]);

  const selectedSupply = useMemo(() => {
    return supplyItems.find((item) => item.supplyItem === selectedSupplyItem);
  }, [supplyItems, selectedSupplyItem]);

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
      setSelectedSupplyItem("");
      setQuantity("");
      setDeliveryMode("");
      setNotes("");

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

  async function handleSubmitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!subcontractor) {
      setError("Please enter your subcontractor email first.");
      return;
    }

    if (!selectedAccountName) {
      setError("Please select an account.");
      return;
    }

    if (!selectedSupplyItem) {
      setError("Please select a supply item.");
      return;
    }

    if (!quantity.trim()) {
      setError("Please enter a quantity.");
      return;
    }

    if (!deliveryMode) {
      setError("Please select pick up or deliver to account.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setSubmittingOrder(true);

    try {
      const response = await fetch("/api/subcontractor-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "submitSupplyOrder",
          subcontractorEmail: subcontractor.email || email.trim(),
          subcontractorName:
            subcontractor.subcontractorName ||
            subcontractor.companyName ||
            subcontractor.contactName ||
            subcontractor.name ||
            "",
          accountId: selectedAccount?.accountId || selectedAccount?.id || "",
          accountName: selectedAccountName,
          supplyItem: selectedSupplyItem,
          quantity: quantity.trim(),
          unit: selectedSupply?.unit || "",
          deliveryMode: deliveryMode,
          notes: notes.trim(),
        }),
      });

      const data = (await response.json()) as PortalResponse;

      if (!response.ok || !data.success) {
        setError(data.error || "Failed to submit supply order.");
        return;
      }

      setSuccessMessage(
        data.orderId
          ? `Supply order submitted successfully. Order ID: ${data.orderId}`
          : "Supply order submitted successfully."
      );

      setSelectedAccountName("");
      setSelectedSupplyItem("");
      setQuantity("");
      setDeliveryMode("");
      setNotes("");
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
                {subcontractor.subcontractorName ||
                  subcontractor.companyName ||
                  subcontractor.contactName ||
                  subcontractor.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {subcontractor.email}
              </p>
            </div>

            <form onSubmit={handleSubmitOrder} className="mt-5 space-y-4">
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

              <div>
                <label className="text-sm font-bold text-slate-700">
                  Supply Item
                </label>
                <select
                  value={selectedSupplyItem}
                  onChange={(event) =>
                    setSelectedSupplyItem(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600"
                  required
                >
                  <option value="">Select supply item</option>
                  {supplyItems.map((item) => (
                    <option
                      key={`${item.rowNumber || ""}-${item.supplyItem || ""}`}
                      value={item.supplyItem || ""}
                    >
                      {item.supplyItem}
                      {item.unit ? ` / ${item.unit}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-bold text-slate-700">
                    Quantity
                  </label>
                  <input
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
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
                    value={selectedSupply?.unit || ""}
                    readOnly
                    placeholder="Auto-filled"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-base text-slate-600"
                  />
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
                className="w-full rounded-2xl bg-blue-700 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
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