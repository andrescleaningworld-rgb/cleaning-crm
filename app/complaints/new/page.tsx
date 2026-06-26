"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type AnyRow = Record<string, unknown>;

type ComplaintForm = {
  accountId: string;
  accountName: string;
  complaintDate: string;
  issue: string;
  priority: string;
  status: string;
  complaintValidity: string;
  reportedBy: string;
  assignedTo: string;
  lastFollowUp: string;
  notes: string;
};

type AccountsApiResponse = {
  success?: boolean;
  error?: string;
  data?: AnyRow[];
  rows?: AnyRow[];
  items?: AnyRow[];
  accounts?: AnyRow[];
};

type SaveComplaintResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  id?: string;
  complaintId?: string;
  data?: {
    id?: string;
    complaintId?: string;
  };
  complaint?: {
    id?: string;
    complaintId?: string;
  };
  notification?: {
    sent?: boolean;
    reason?: string;
  };
};

type SelectedPhoto = {
  file: File;
  previewUrl: string;
};

const MAX_COMPLAINT_PHOTOS = 5;
const MAX_PHOTO_SIZE_MB = 25;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function getValue(row: AnyRow, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return "";
}

function normalize(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getAccountName(account: AnyRow) {
  return cleanText(
    getValue(account, [
      "Account Name",
      "accountName",
      "Account",
      "account",
      "Name",
      "name",
    ])
  );
}

function getAccountId(account: AnyRow) {
  return cleanText(
    getValue(account, ["Account ID", "accountId", "ID", "id"])
  );
}

function getAccountManager(account: AnyRow) {
  return cleanText(
    getValue(account, [
      "Manager",
      "manager",
      "Account Manager",
      "accountManager",
    ])
  );
}

function isRealAccount(account: AnyRow) {
  return getAccountName(account).length > 0;
}

async function safeReadData(response: Response): Promise<AnyRow[]> {
  try {
    if (!response.ok) {
      const text = await response.text();
      console.error("Accounts API failed:", response.status, text.slice(0, 300));
      return [];
    }

    const text = await response.text();

    if (!text) return [];

    if (text.trim().startsWith("<")) {
      console.error("Accounts API returned HTML:", text.slice(0, 300));
      return [];
    }

    const data = JSON.parse(text) as AccountsApiResponse | AnyRow[];

    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.rows)) return data.rows;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.accounts)) return data.accounts;

    return [];
  } catch (error) {
    console.error("Read accounts error:", error);
    return [];
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error("Could not read photo file."));
    };

    reader.readAsDataURL(file);
  });
}

const emptyForm: ComplaintForm = {
  accountId: "",
  accountName: "",
  complaintDate: todayDate(),
  issue: "",
  priority: "Medium",
  status: "Open",
  complaintValidity: "Needs Review",
  reportedBy: "",
  assignedTo: "",
  lastFollowUp: "",
  notes: "",
};

function NewComplaintPageContent() {
  const searchParams = useSearchParams();

  const urlAccountId = cleanText(searchParams.get("accountId"));
  const urlAccountName =
    cleanText(searchParams.get("accountName")) ||
    cleanText(searchParams.get("account"));

  const [accounts, setAccounts] = useState<AnyRow[]>([]);
  const [form, setForm] = useState<ComplaintForm>(emptyForm);
  const [accountSearch, setAccountSearch] = useState("");
  const [showAccountResults, setShowAccountResults] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);

  async function loadAccounts() {
    try {
      setLoadingAccounts(true);

      const response = await fetch("/api/accounts", {
        cache: "no-store",
      });

      const data = await safeReadData(response);

      setAccounts(data.filter((account) => isRealAccount(account)));
    } catch (error) {
      console.error("Load accounts error:", error);
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (!urlAccountId && !urlAccountName) return;

    setForm((current) => ({
      ...current,
      accountId: urlAccountId || current.accountId,
      accountName: urlAccountName || current.accountName,
    }));

    if (urlAccountName) {
      setAccountSearch(urlAccountName);
      setShowAccountResults(false);
    }
  }, [urlAccountId, urlAccountName]);

  useEffect(() => {
    if ((!urlAccountId && !urlAccountName) || accounts.length === 0) return;

    const matchingAccount = accounts.find((account) => {
      const accountId = normalize(getAccountId(account));
      const accountName = normalize(getAccountName(account));

      return (
        (urlAccountId && accountId === normalize(urlAccountId)) ||
        (urlAccountName && accountName === normalize(urlAccountName))
      );
    });

    if (!matchingAccount) return;

    const matchedAccountId = getAccountId(matchingAccount);
    const matchedAccountName = getAccountName(matchingAccount);
    const matchedManager = getAccountManager(matchingAccount);

    setForm((current) => ({
      ...current,
      accountId: matchedAccountId || current.accountId,
      accountName: matchedAccountName || current.accountName,
      assignedTo: current.assignedTo || matchedManager,
    }));

    if (matchedAccountName) {
      setAccountSearch(matchedAccountName);
      setShowAccountResults(false);
    }
  }, [accounts, urlAccountId, urlAccountName]);

  useEffect(() => {
    return () => {
      selectedPhotos.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
    };
  }, [selectedPhotos]);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) =>
      getAccountName(a).localeCompare(getAccountName(b))
    );
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const search = accountSearch.toLowerCase().trim();

    if (!search) return sortedAccounts.slice(0, 10);

    return sortedAccounts
      .filter((account) => {
        const accountName = getAccountName(account).toLowerCase();
        const accountId = getAccountId(account).toLowerCase();
        const manager = getAccountManager(account).toLowerCase();

        return (
          accountName.includes(search) ||
          accountId.includes(search) ||
          manager.includes(search)
        );
      })
      .slice(0, 12);
  }, [accountSearch, sortedAccounts]);

  function updateForm(field: keyof ComplaintForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function selectAccount(account: AnyRow) {
    const accountName = getAccountName(account);
    const accountId = getAccountId(account);
    const manager = getAccountManager(account);

    setForm((current) => ({
      ...current,
      accountId,
      accountName,
      assignedTo: current.assignedTo || manager,
    }));

    setAccountSearch(accountName);
    setShowAccountResults(false);
  }

  function clearSelectedAccount() {
    setForm((current) => ({
      ...current,
      accountId: "",
      accountName: "",
    }));

    setAccountSearch("");
    setShowAccountResults(true);
  }

  function handlePhotoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);

    const remainingSlots = MAX_COMPLAINT_PHOTOS - selectedPhotos.length;

    if (remainingSlots <= 0) {
      setMessage(
        `You can upload up to ${MAX_COMPLAINT_PHOTOS} photos per complaint.`
      );
      event.target.value = "";
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      setMessage("Please select image files only.");
      event.target.value = "";
      return;
    }

    const validSizeFiles = imageFiles.filter((file) => {
      const sizeMb = file.size / 1024 / 1024;
      return sizeMb <= MAX_PHOTO_SIZE_MB;
    });

    if (validSizeFiles.length < imageFiles.length) {
      setMessage(
        `Some photos were skipped because each photo must be ${MAX_PHOTO_SIZE_MB} MB or smaller.`
      );
    }

    const limitedFiles = validSizeFiles.slice(0, remainingSlots);

    if (validSizeFiles.length > remainingSlots) {
      setMessage(
        `Only ${remainingSlots} more photo${
          remainingSlots === 1 ? "" : "s"
        } can be added. Maximum is ${MAX_COMPLAINT_PHOTOS}.`
      );
    }

    const newPhotos = limitedFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setSelectedPhotos((current) => [...current, ...newPhotos]);

    event.target.value = "";
  }

  function removeSelectedPhoto(indexToRemove: number) {
    setSelectedPhotos((current) => {
      const photoToRemove = current[indexToRemove];

      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.previewUrl);
      }

      return current.filter((_, index) => index !== indexToRemove);
    });
  }

  async function uploadComplaintPhotos(sourceId: string) {
    if (selectedPhotos.length === 0) return;

    for (const selectedPhoto of selectedPhotos) {
      const base64Data = await fileToBase64(selectedPhoto.file);

      const response = await fetch("/api/photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: form.accountId,
          accountName: form.accountName,
          sourceType: "Complaint",
          sourceId,
          uploadedBy: form.reportedBy || form.assignedTo || "Cleaning World",
          userRole: "Admin",
          fileName: selectedPhoto.file.name,
          mimeType: selectedPhoto.file.type || "image/jpeg",
          base64Data,
          notes: form.notes || form.issue,
        }),
      });

      const text = await response.text();

      let data: { success?: boolean; message?: string; error?: string } = {};

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Photo upload did not return valid JSON.");
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.message || "Photo upload failed.");
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.accountName) {
      setMessage("Please select an account before saving the complaint.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addComplaint",
          complaint: {
            accountId: form.accountId,
            accountName: form.accountName,
            date: form.complaintDate,
            complaintDate: form.complaintDate,
            issue: form.issue,
            description: form.issue,
            complaintType: form.issue,
            priority: form.priority,
            severity: form.priority,
            status: form.status,
            complaintValidity: form.complaintValidity,
            validity: form.complaintValidity,
            reportedBy: form.reportedBy,
            manager: form.assignedTo,
            assignedTo: form.assignedTo,
            lastFollowUp: form.lastFollowUp,
            followUpDate: form.lastFollowUp,
            notes: form.notes,

            "Account ID": form.accountId,
            "Account Name": form.accountName,
            "Complaint Date": form.complaintDate,
            Issue: form.issue,
            Priority: form.priority,
            Status: form.status,
            "Complaint Validity": form.complaintValidity,
            "Reported By": form.reportedBy,
            "Assigned To": form.assignedTo,
            "Last Follow-Up": form.lastFollowUp,
            Notes: form.notes,
          },
        }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "Failed to save complaint.");
      }

      let data: SaveComplaintResponse = {};

      try {
        data = JSON.parse(text) as SaveComplaintResponse;
      } catch {
        data = {};
      }

      if (data.success === false) {
        throw new Error(
          data.error || data.message || "Failed to save complaint."
        );
      }

      const complaintSourceId =
        data.complaintId ||
        data.id ||
        data.complaint?.complaintId ||
        data.complaint?.id ||
        data.data?.complaintId ||
        data.data?.id ||
        `COMP-${Date.now()}`;

      let successMessage = "Complaint saved successfully.";

      if (selectedPhotos.length > 0) {
        await uploadComplaintPhotos(complaintSourceId);
        successMessage += ` ${selectedPhotos.length} photo${
          selectedPhotos.length === 1 ? "" : "s"
        } uploaded.`;
      }

      if (data.notification?.sent) {
        successMessage += " Subcontractor notification email sent.";
      } else if (data.notification?.reason) {
        successMessage += ` Notification not sent: ${data.notification.reason}`;
      }

      selectedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));

      setMessage(successMessage);
      setForm(emptyForm);
      setSelectedPhotos([]);
      setAccountSearch("");
      setShowAccountResults(false);
    } catch (error) {
      console.error("Save complaint error:", error);
      setMessage(
        error instanceof Error ? error.message : "Failed to save complaint."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Add Complaint
              </h1>

              <p className="mt-1 text-gray-600">
                Create a new account complaint, attach photos, and notify the
                assigned subcontractor when possible.
              </p>
            </div>

            <Link
              href="/complaints"
              className="rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Back to Complaints
            </Link>
          </div>
        </section>

        {message && (
          <section className="rounded-2xl bg-white p-4 shadow">
            <p
              className={`text-sm font-semibold ${
                message.toLowerCase().includes("failed") ||
                message.toLowerCase().includes("error") ||
                message.toLowerCase().includes("please") ||
                message.toLowerCase().includes("skipped") ||
                message.toLowerCase().includes("only")
                  ? "text-red-700"
                  : "text-green-700"
              }`}
            >
              {message}
            </p>
          </section>
        )}

        <section className="rounded-2xl bg-white p-6 shadow">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Account
              </label>

              <input
                value={accountSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  setAccountSearch(value);
                  setShowAccountResults(true);

                  setForm((current) => ({
                    ...current,
                    accountId: "",
                    accountName: "",
                  }));
                }}
                onFocus={() => setShowAccountResults(true)}
                disabled={loadingAccounts && !form.accountName}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder={
                  loadingAccounts ? "Loading accounts..." : "Type account name..."
                }
              />

              {form.accountName && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                  <span>
                    Selected: <strong>{form.accountName}</strong>
                  </span>

                  <button
                    type="button"
                    onClick={clearSelectedAccount}
                    className="font-semibold text-green-900 hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}

              {showAccountResults && !form.accountName && !loadingAccounts && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-500">
                      No accounts found.
                    </div>
                  ) : (
                    filteredAccounts.map((account, index) => {
                      const accountName = getAccountName(account);
                      const accountId = getAccountId(account);
                      const manager = getAccountManager(account);

                      return (
                        <button
                          key={`${accountId || accountName}-${index}`}
                          type="button"
                          onClick={() => selectAccount(account)}
                          className="block w-full border-b border-gray-100 px-3 py-3 text-left hover:bg-gray-50"
                        >
                          <p className="font-semibold text-gray-900">
                            {accountName}
                          </p>

                          <p className="text-xs text-gray-500">
                            {accountId || "No ID"}
                            {manager ? ` · Manager: ${manager}` : ""}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Complaint Date
                </label>

                <input
                  type="date"
                  value={form.complaintDate}
                  onChange={(event) =>
                    updateForm("complaintDate", event.target.value)
                  }
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Priority
                </label>

                <select
                  value={form.priority}
                  onChange={(event) =>
                    updateForm("priority", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Urgent</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Status
                </label>

                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option>Open</option>
                  <option>Pending</option>
                  <option>Needs Attention</option>
                  <option>Closed</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Complaint Validity
                </label>

                <select
                  value={form.complaintValidity}
                  onChange={(event) =>
                    updateForm("complaintValidity", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option>Valid</option>
                  <option>Not Valid</option>
                  <option>Subjective</option>
                  <option>Needs Review</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Issue
              </label>

              <input
                value={form.issue}
                onChange={(event) => updateForm("issue", event.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Example: Restrooms not cleaned properly"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Reported By
                </label>

                <input
                  value={form.reportedBy}
                  onChange={(event) =>
                    updateForm("reportedBy", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Customer, manager, office..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Assigned To
                </label>

                <input
                  value={form.assignedTo}
                  onChange={(event) =>
                    updateForm("assignedTo", event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Manager or person responsible"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Last Follow-Up / Follow-Up Date
              </label>

              <input
                type="date"
                value={form.lastFollowUp}
                onChange={(event) =>
                  updateForm("lastFollowUp", event.target.value)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Notes
              </label>

              <textarea
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                className="min-h-32 w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Add details, customer comments, photos reference, or follow-up instructions..."
              />
            </div>

            <div className="rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label className="block text-base font-extrabold text-slate-900">
                    Upload Complaint Photos
                  </label>

                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Up to {MAX_COMPLAINT_PHOTOS} photos per complaint · Max{" "}
                    {MAX_PHOTO_SIZE_MB} MB each
                  </p>
                </div>

                <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-blue-700 shadow-sm">
                  {selectedPhotos.length}/{MAX_COMPLAINT_PHOTOS} selected
                </span>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-blue-200 bg-white px-4 py-6 text-center shadow-sm hover:border-blue-500 hover:bg-blue-50">
                <span className="text-3xl">📷</span>

                <span className="mt-2 text-sm font-extrabold text-blue-700">
                  Choose Photos
                </span>

                <span className="mt-1 text-xs font-semibold text-slate-500">
                  Tap here to add photos from phone or desktop
                </span>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  disabled={selectedPhotos.length >= MAX_COMPLAINT_PHOTOS}
                  className="hidden"
                />
              </label>

              <p className="mt-3 text-xs leading-5 text-slate-600">
                Add photos showing the issue, before/after condition, or
                customer concern. Photos will be saved in Google Drive under CWO
                Photos.
              </p>

              {selectedPhotos.length >= MAX_COMPLAINT_PHOTOS ? (
                <p className="mt-3 rounded-xl bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-800">
                  Maximum photo limit reached for this complaint.
                </p>
              ) : null}

              {selectedPhotos.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {selectedPhotos.map((photo, index) => (
                    <div
                      key={`${photo.file.name}-${index}`}
                      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <Image
                        src={photo.previewUrl}
                        alt={`Selected complaint photo ${index + 1}`}
                        width={280}
                        height={112}
                        unoptimized
                        className="h-28 w-full object-cover"
                      />

                      <div className="p-2">
                        <p className="truncate text-xs font-bold text-gray-700">
                          Photo {index + 1}
                        </p>

                        <p className="truncate text-[11px] text-gray-500">
                          {photo.file.name}
                        </p>

                        <button
                          type="button"
                          onClick={() => removeSelectedPhoto(index)}
                          className="mt-2 w-full rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Complaint"}
              </button>

              <Link
                href="/complaints"
                className="rounded-lg border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function NewComplaintPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-100 p-4 sm:p-6">
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow">
            <p className="font-semibold text-gray-700">
              Loading complaint form...
            </p>
          </div>
        </main>
      }
    >
      <NewComplaintPageContent />
    </Suspense>
  );
}