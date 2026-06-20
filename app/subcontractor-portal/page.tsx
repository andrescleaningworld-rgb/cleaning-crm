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
  serviceType?: string;
  frequency?: string;
  cleaningDays?: string;
  scopeOfWork?: string;
  monthlySubcontractorPay?: string;
  subcontractorPay?: string;
  hasKey?: string;
  alarmCode?: string;
  keyAlarmAccessInfo?: string;
  accountHealth?: string;
  manager?: string;
  notes?: string;
};

type Complaint = {
  rowNumber?: number | string;
  id?: string;
  complaintId?: string;
  accountId?: string;
  accountName?: string;
  date?: string;
  complaintDate?: string;
  complaintType?: string;
  issueType?: string;
  type?: string;
  issue?: string;
  description?: string;
  priority?: string;
  severity?: string;
  status?: string;
  complaintValidity?: string;
  validity?: string;
  manager?: string;
  assignedTo?: string;
  subcontractor?: string;
  resolution?: string;
  resolutionNotes?: string;
  followUpDate?: string;
  lastFollowUp?: string;
  notes?: string;
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
  complaints?: Complaint[];
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

function displayValue(value: unknown) {
  const text = cleanText(value);
  return text || "Not listed";
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

function isOpenComplaint(complaint: Complaint) {
  const status = cleanLower(complaint.status);

  if (!status) return true;

  return !["closed", "complete", "completed"].some((closedStatus) => {
    return status === closedStatus;
  });
}

function getAccountId(account: Account) {
  return cleanText(account.accountId || account.id || account.accountName);
}

function getAccountName(account: Account) {
  return cleanText(account.accountName) || "Unnamed Account";
}

function getFullAddress(account: Account) {
  return [account.address, account.city, account.state, account.zip]
    .map(cleanText)
    .filter(Boolean)
    .join(", ");
}

function getSubPay(account: Account) {
  return cleanText(account.monthlySubcontractorPay || account.subcontractorPay);
}

function getKeyInfo(account: Account) {
  return cleanText(account.keyAlarmAccessInfo || account.hasKey);
}

function getAlarmInfo(account: Account) {
  return cleanText(account.alarmCode || account.keyAlarmAccessInfo);
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

function getComplaintId(complaint: Complaint) {
  return (
    cleanText(complaint.id) ||
    cleanText(complaint.complaintId) ||
    cleanText(complaint.rowNumber) ||
    `${cleanText(complaint.accountName)}-${cleanText(
      complaint.complaintDate || complaint.date
    )}`
  );
}

function getComplaintDate(complaint: Complaint) {
  return cleanText(complaint.complaintDate || complaint.date) || "No date";
}

function getComplaintType(complaint: Complaint) {
  return (
    cleanText(
      complaint.complaintType ||
        complaint.issueType ||
        complaint.type ||
        complaint.issue
    ) || "Complaint"
  );
}

function getComplaintDescription(complaint: Complaint) {
  return (
    cleanText(complaint.description || complaint.issue || complaint.notes) ||
    "No description provided."
  );
}

function getComplaintPriority(complaint: Complaint) {
  return cleanText(complaint.priority || complaint.severity) || "Medium";
}

function getComplaintStatus(complaint: Complaint) {
  return cleanText(complaint.status) || "Open";
}

function getComplaintFollowUp(complaint: Complaint) {
  return cleanText(complaint.followUpDate || complaint.lastFollowUp);
}

export default function SubcontractorPortalPage() {
  const [email, setEmail] = useState("");
  const [subcontractor, setSubcontractor] = useState<Subcontractor | null>(
    null
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);

  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [notes, setNotes] = useState("");
  const [orderItems, setOrderItems] = useState<OrderLineItem[]>([
    makeLineItem(),
  ]);

  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>(
    {}
  );
  const [resolvingComplaintId, setResolvingComplaintId] = useState("");

  const [loading, setLoading] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const activeAccounts = useMemo(() => {
    return accounts.filter(isActiveAccount);
  }, [accounts]);

  const openComplaints = useMemo(() => {
    return complaints.filter(isOpenComplaint);
  }, [complaints]);

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
    return activeAccounts.find((account) => {
      return getAccountName(account) === selectedAccountName;
    });
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

  function selectAccount(account: Account) {
    setSelectedAccountName(getAccountName(account));
    setError("");
    setSuccessMessage("");
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
          };
        }

        if (field === "supplyItem") {
          const selectedSupply = activeSupplyItems.find((supply) => {
            return getSupplyName(supply) === value;
          });

          return {
            ...item,
            supplyItem: value,
            customItemName:
              value === OTHER_ITEM_VALUE ? item.customItemName : "",
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

  async function loadPortal(emailToLoad: string) {
    const response = await fetch("/api/subcontractor-portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "getSubcontractorPortalByEmail",
        email: emailToLoad.trim(),
      }),
    });

    const data = (await response.json()) as PortalResponse;

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
          data.message ||
          "We could not load the subcontractor portal."
      );
    }

    return data;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const data = await loadPortal(email);

      setSubcontractor(data.subcontractor || null);
      setAccounts(data.accounts || []);
      setComplaints(data.complaints || []);
      setSupplyItems(data.supplyItems || []);
      setSelectedAccountName("");
      setDeliveryMode("");
      setNotes("");
      setOrderItems([makeLineItem()]);
      setResolutionNotes({});

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
      setSubcontractor(null);
      setAccounts([]);
      setComplaints([]);
      setSupplyItems([]);
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

  async function handleResolveComplaint(complaint: Complaint) {
    if (!subcontractor) return;

    const complaintKey = getComplaintId(complaint);
    const resolutionNote = cleanText(resolutionNotes[complaintKey]);

    if (!resolutionNote) {
      setError("Please enter a resolution note before marking resolved.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setResolvingComplaintId(complaintKey);

    try {
      const today = new Date().toISOString().slice(0, 10);

      const response = await fetch("/api/subcontractor-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "resolveComplaintBySubcontractor",
          complaint: {
            rowNumber: complaint.rowNumber || "",
            id: complaint.id || complaint.complaintId || "",
            accountId: complaint.accountId || "",
            accountName: complaint.accountName || "",
            date: complaint.date || complaint.complaintDate || "",
            complaintDate: complaint.complaintDate || complaint.date || "",
            complaintType: getComplaintType(complaint),
            issue: complaint.issue || complaint.description || "",
            description: getComplaintDescription(complaint),
            priority: getComplaintPriority(complaint),
            status: "Resolved by Sub",
            subcontractor:
              complaint.subcontractor ||
              getSubcontractorDisplayName(subcontractor),
            resolution: resolutionNote,
            resolutionNotes: resolutionNote,
            notes: `Resolved by ${getSubcontractorDisplayName(
              subcontractor
            )}: ${resolutionNote}`,
            followUpDate: today,
            closedDate: "",
          },
        }),
      });

      const data = (await response.json()) as PortalResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || data.message || "Could not resolve complaint."
        );
      }

      setComplaints((currentComplaints) =>
        currentComplaints.map((item) => {
          if (getComplaintId(item) !== complaintKey) return item;

          return {
            ...item,
            status: "Resolved by Sub",
            resolution: resolutionNote,
            resolutionNotes: resolutionNote,
            followUpDate: today,
          };
        })
      );

      setResolutionNotes((currentNotes) => ({
        ...currentNotes,
        [complaintKey]: "",
      }));

      setSuccessMessage(
        "Complaint marked as Resolved by Sub. Cleaning World will review and close it."
      );
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Unknown error resolving complaint."
      );
    } finally {
      setResolvingComplaintId("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-sky-500 p-6 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-black">Subcontractor Portal</h1>
          <p className="mt-3 text-sm leading-6 text-blue-50">
            Enter the email Cleaning World has on file. After your email is
            verified, you will only see your assigned accounts, complaints, and
            supply order options.
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
          <>
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

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-black uppercase text-blue-700">
                    Assigned Accounts
                  </p>
                  <p className="mt-2 text-3xl font-black text-blue-950">
                    {activeAccounts.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                  <p className="text-xs font-black uppercase text-orange-700">
                    Open Complaints
                  </p>
                  <p className="mt-2 text-3xl font-black text-orange-900">
                    {openComplaints.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                  <p className="text-xs font-black uppercase text-green-700">
                    Portal Status
                  </p>
                  <p className="mt-2 text-lg font-black text-green-900">
                    Active
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    My Assigned Accounts
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Tap an account to view job details and select it for supply
                    orders.
                  </p>
                </div>

                <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                  {activeAccounts.length} active
                </span>
              </div>

              {activeAccounts.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                  No active assigned accounts were found for this email.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {activeAccounts.map((account) => {
                    const accountName = getAccountName(account);
                    const accountId = getAccountId(account);
                    const isSelected = accountName === selectedAccountName;

                    return (
                      <button
                        key={`${accountId}-${accountName}`}
                        type="button"
                        onClick={() => selectAccount(account)}
                        className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-black text-slate-950">
                              {accountName}
                            </h3>
                            <p className="mt-1 text-sm leading-5 text-slate-600">
                              {getFullAddress(account) || "Address not listed"}
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              isSelected
                                ? "bg-blue-700 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {isSelected ? "Selected" : "View"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedAccount ? (
                <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-5">
                  <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                    Selected Account Details
                  </p>

                  <h3 className="mt-2 text-2xl font-black text-slate-950">
                    {getAccountName(selectedAccount)}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {getFullAddress(selectedAccount) || "Address not listed"}
                  </p>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Service Type
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {displayValue(selectedAccount.serviceType)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Frequency
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {displayValue(selectedAccount.frequency)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Cleaning Days / Schedule
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {displayValue(selectedAccount.cleaningDays)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Account Health
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {displayValue(selectedAccount.accountHealth)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Sub Pay
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {displayValue(getSubPay(selectedAccount))}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Key
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {displayValue(getKeyInfo(selectedAccount))}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm md:col-span-2">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Alarm
                      </p>
                      <p className="mt-1 whitespace-pre-wrap font-bold text-slate-900">
                        {displayValue(getAlarmInfo(selectedAccount))}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm md:col-span-2">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Scope of Work
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {displayValue(selectedAccount.scopeOfWork)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs font-semibold text-slate-500">
                    Internal Cleaning World notes, revenue, gross margin, and
                    private customer information are hidden from this portal.
                  </p>
                </div>
              ) : null}
            </section>

            <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-900">
                My Open Complaints
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Review complaints connected to your assigned accounts. Mark them
                as resolved after the issue has been corrected. Cleaning World
                will review and officially close the complaint.
              </p>

              {openComplaints.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
                  No open complaints are currently assigned to your accounts.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {openComplaints.map((complaint) => {
                    const complaintKey = getComplaintId(complaint);
                    const status = getComplaintStatus(complaint);
                    const isResolvedBySub =
                      cleanLower(status) === "resolved by sub";

                    return (
                      <div
                        key={complaintKey}
                        className="rounded-3xl border border-orange-200 bg-orange-50 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-orange-700">
                              {getComplaintPriority(complaint)} Priority
                            </p>
                            <h3 className="mt-1 text-lg font-black text-slate-900">
                              {complaint.accountName || "Account"}
                            </h3>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                              {getComplaintType(complaint)} •{" "}
                              {getComplaintDate(complaint)}
                            </p>
                          </div>

                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-orange-700">
                            {status}
                          </span>
                        </div>

                        <div className="mt-4 rounded-2xl border border-orange-100 bg-white p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                            Description
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {getComplaintDescription(complaint)}
                          </p>
                        </div>

                        {getComplaintFollowUp(complaint) ? (
                          <p className="mt-3 text-sm text-slate-700">
                            <strong>Follow-up date:</strong>{" "}
                            {getComplaintFollowUp(complaint)}
                          </p>
                        ) : null}

                        {isResolvedBySub ? (
                          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
                            This complaint has been marked Resolved by Sub and
                            is waiting for Cleaning World review.
                          </div>
                        ) : (
                          <div className="mt-4">
                            <label className="text-sm font-bold text-slate-700">
                              Resolution Note
                            </label>
                            <textarea
                              value={resolutionNotes[complaintKey] || ""}
                              onChange={(event) =>
                                setResolutionNotes((currentNotes) => ({
                                  ...currentNotes,
                                  [complaintKey]: event.target.value,
                                }))
                              }
                              rows={3}
                              placeholder="Explain what was corrected, when, and any follow-up needed."
                              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-orange-600"
                            />

                            <button
                              type="button"
                              onClick={() => handleResolveComplaint(complaint)}
                              disabled={resolvingComplaintId === complaintKey}
                              className="mt-3 w-full rounded-2xl bg-orange-600 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {resolvingComplaintId === complaintKey
                                ? "Saving Resolution..."
                                : "Mark Resolved by Sub"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-900">
                Submit Supply Order
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Select one of your assigned accounts and add one or more supply
                items.
              </p>

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
                        key={`${getAccountId(account)}-${getAccountName(
                          account
                        )}`}
                        value={getAccountName(account)}
                      >
                        {getAccountName(account)}
                      </option>
                    ))}
                  </select>
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
                      const filteredSupplies =
                        getFilteredSuppliesForLine(lineItem);
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
                                    key={`${
                                      item.rowNumber || ""
                                    }-${getSupplyName(item)}`}
                                    value={getSupplyName(item)}
                                  >
                                    {getSupplyDescription(item) ||
                                      getSupplyName(item)}
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
                                  placeholder="Describe exactly what is needed."
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
                                    isOther
                                      ? "Office will review"
                                      : "Auto-filled"
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
                    <option value="Deliver to Account">
                      Deliver to Account
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700">
                    Supply Order Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add supply order instructions only, if needed"
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingOrder}
                  className="w-full rounded-2xl bg-blue-700 px-5 py-4 text-base font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingOrder
                    ? "Submitting Order..."
                    : "Submit Supply Order"}
                </button>
              </form>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}