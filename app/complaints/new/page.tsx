"use client";

import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PinSwitch, pinAfterSave, startingPin, usePinInfo, type PinChoice } from "../../components/pin-to-board";
import { BigButton, Card, ErrorBox, Field, Screen, SelectField, SkeletonList, TextAreaField } from "@/app/ui";

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
  subcontractor: string;
  lastFollowUp: string;
  notes: string;
  todoDueDate: string;
};

type Manager = {
  name?: string;
  status?: string;
};

type ManagersApiResponse =
  | Manager[]
  | { managers?: Manager[]; data?: Manager[] };

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
  rowNumber?: string | number;
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

// Strips diacritics (e.g. "Andrés" -> "andres") so account records that spell
// a manager's name without accents still fuzzy-match the canonical roster.
function normalizeManagerName(value: unknown): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "";

  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// Fuzzy-matches raw account manager text against the canonical, active
// Managers roster and returns the canonical-cased name, or "" if no match
// (e.g. combined free-text like "Andres , Greg", or an inactive/unknown
// manager) — the Manager field is now a dropdown, so it must never be
// prefilled with a value that isn't one of its own options.
function findCanonicalManager(managers: string[], rawManagerText: string): string {
  const target = normalizeManagerName(rawManagerText);
  if (!target) return "";

  return managers.find((name) => normalizeManagerName(name) === target) || "";
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

function getAccountSubcontractor(account: AnyRow) {
  return cleanText(
    getValue(account, [
      "Subcontractor",
      "subcontractor",
      "Sub Contractor",
      "subContractor",
      "Cleaner",
      "cleaner",
      "Sub",
      "sub",
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

function makeEmptyForm(): ComplaintForm {
  const complaintDate = todayDate();

  return {
    accountId: "",
    accountName: "",
    complaintDate,
    issue: "",
    priority: "Medium",
    status: "Open",
    complaintValidity: "Needs Review",
    reportedBy: "",
    assignedTo: "",
    subcontractor: "",
    lastFollowUp: "",
    notes: "",
    todoDueDate: addDays(complaintDate, 2),
  };
}

const emptyForm: ComplaintForm = makeEmptyForm();

function NewComplaintPageContent() {
  const searchParams = useSearchParams();

  const urlAccountId = cleanText(searchParams.get("accountId"));
  const urlAccountName =
    cleanText(searchParams.get("accountName")) ||
    cleanText(searchParams.get("account"));
  // Team Hub's "Promote to complaint" link (app/accounts/[id]/team-hub-tab.tsx)
  // prefills the issue description this way — manual-only, never auto-saved.
  const urlIssue = cleanText(searchParams.get("issue"));

  const [accounts, setAccounts] = useState<AnyRow[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(true);
  const [form, setForm] = useState<ComplaintForm>(emptyForm);
  const [accountSearch, setAccountSearch] = useState("");
  const [showAccountResults, setShowAccountResults] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  // "Pin to board": starts as Settings says, in the square of whoever the complaint is assigned to.
  const { info: pinInfo } = usePinInfo();
  const [pinPicked, setPinPicked] = useState<PinChoice | null>(null);
  const pinChoice = pinPicked ?? startingPin(pinInfo, "complaint", form.assignedTo);
  const [message, setMessage] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [todoDueDateTouched, setTodoDueDateTouched] = useState(false);

  async function loadManagers() {
    try {
      setLoadingManagers(true);

      const response = await fetch("/api/admin/managers", {
        cache: "no-store",
      });

      const data = (await response.json()) as ManagersApiResponse;

      const rows: Manager[] = Array.isArray(data)
        ? data
        : data.managers || data.data || [];

      const activeNames = Array.from(
        new Set(
          rows
            .filter((row) => !row.status || row.status === "Active")
            .map((row) => cleanText(row.name))
            .filter(Boolean)
        )
      ).sort();

      setManagers(activeNames);
    } catch (error) {
      console.error("Load managers error:", error);
      setManagers([]);
    } finally {
      setLoadingManagers(false);
    }
  }

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
    loadManagers();
  }, []);

  useEffect(() => {
    if (!urlAccountId && !urlAccountName && !urlIssue) return;

    setForm((current) => ({
      ...current,
      accountId: urlAccountId || current.accountId,
      accountName: urlAccountName || current.accountName,
      issue: urlIssue || current.issue,
    }));

    if (urlAccountName) {
      setAccountSearch(urlAccountName);
      setShowAccountResults(false);
    }
  }, [urlAccountId, urlAccountName, urlIssue]);

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
    const matchedManager = findCanonicalManager(
      managers,
      getAccountManager(matchingAccount)
    );
    const matchedSubcontractor = getAccountSubcontractor(matchingAccount);

    setForm((current) => ({
      ...current,
      accountId: matchedAccountId || current.accountId,
      accountName: matchedAccountName || current.accountName,
      assignedTo: current.assignedTo || matchedManager,
      subcontractor: current.subcontractor || matchedSubcontractor,
    }));

    if (matchedAccountName) {
      setAccountSearch(matchedAccountName);
      setShowAccountResults(false);
    }
  }, [accounts, managers, urlAccountId, urlAccountName]);

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
    const manager = findCanonicalManager(managers, getAccountManager(account));
    const subcontractor = getAccountSubcontractor(account);

    setForm((current) => ({
      ...current,
      accountId,
      accountName,
      assignedTo: current.assignedTo || manager,
      subcontractor: current.subcontractor || subcontractor,
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
            subcontractor: form.subcontractor,
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

      // Matches what /api/complaints actually returns today (data.id /
      // data.rowNumber, both top-level) — the previous version of this
      // resolution guessed at data.complaint?.id / data.data?.id shapes that
      // the route never produces, so it always fell through to the
      // synthetic COMP-<timestamp> fallback.
      const complaintSourceId =
        data.id ||
        (data.rowNumber ? String(data.rowNumber) : "") ||
        `COMP-${Date.now()}`;

      // The complaint is saved; put its paper in the chosen square. (Only with its real id: a made-up one pins nothing.)
      await pinAfterSave(pinInfo, "complaint", pinChoice, { recordId: data.id ?? "", title: form.accountName, accountId: form.accountId, accountName: form.accountName });
      setPinPicked(null);

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

      // Auto-create the follow-up to-do. Fault-isolated: the complaint has
      // already saved successfully at this point, so a failure here must
      // not make the submission look like it failed — just note it.
      try {
        const todoResponse = await fetch("/api/to-do", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "addToDo",
            dueDate: form.todoDueDate,
            assignedTo: form.assignedTo,
            accountName: form.accountName,
            taskType: "Complaint Follow-Up",
            status: "Open",
            why: form.issue,
            notes: form.notes,
            complaintId: complaintSourceId,
          }),
        });

        const todoData = await todoResponse.json();

        if (!todoResponse.ok || todoData.success === false) {
          throw new Error(todoData.message || "Could not create follow-up to-do.");
        }

        successMessage += " Follow-up to-do created.";
      } catch (todoError) {
        console.error("Auto-create to-do error:", todoError);
        successMessage +=
          " Could not create the follow-up to-do automatically — add one manually from the To-Do page if needed.";
      }

      selectedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));

      setMessage(successMessage);
      setForm(makeEmptyForm());
      setTodoDueDateTouched(false);
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

  // Same rule as before for which messages are problems.
  const messageIsProblem = ["failed", "error", "please", "skipped", "only"].some((word) => message.toLowerCase().includes(word));

  return (
    <Screen
      title="Add complaint"
      subtitle="Create a new account complaint, attach photos, and notify the assigned subcontractor when possible."
      backHref="/complaints"
    >
      {message ? (
        messageIsProblem ? (
          <ErrorBox title="Please check this." text={message} />
        ) : (
          <p className="ui-savestatus ui-savestatus-saved" role="status">
            {message}
          </p>
        )
      ) : null}

      {/* The form keeps the browser's own "fill this in" checks (account, date, issue, manager). */}
      <form onSubmit={handleSubmit} className="ui-screen-body">
        <div className="ui-field" style={{ position: "relative" }}>
          <Field
            label="Account"
            hint="Type a few letters, then tap the account in the list."
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
            autoComplete="off"
            placeholder={loadingAccounts ? "Loading accounts…" : "Type account name"}
          />

          {form.accountName && (
            <div className="ui-picker-option" style={{ cursor: "default" }}>
              <span>
                Selected: <span className="ui-strong">{form.accountName}</span>
              </span>
              <BigButton kind="quiet" onClick={clearSelectedAccount}>
                Change
              </BigButton>
            </div>
          )}

          {showAccountResults && !form.accountName && !loadingAccounts && (
            <div className="ui-picker-list ui-autocomplete-list">
              {filteredAccounts.length === 0 ? (
                <p className="ui-muted" style={{ padding: "10px 14px", margin: 0 }}>
                  No accounts found.
                </p>
              ) : (
                filteredAccounts.map((account, index) => {
                  const accountName = getAccountName(account);
                  const accountId = getAccountId(account);
                  const manager = getAccountManager(account);

                  return (
                    <button key={`${accountId || accountName}-${index}`} type="button" onClick={() => selectAccount(account)} className="ui-picker-option">
                      <span style={{ minWidth: 0, textAlign: "left" }}>
                        <span className="ui-strong" style={{ display: "block" }}>
                          {accountName}
                        </span>
                        {manager ? (
                          <span className="ui-muted" style={{ display: "block" }}>
                            Manager: {manager}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <Field
          label="Complaint date"
          type="date"
          value={form.complaintDate}
          onChange={(event) => {
            const value = event.target.value;
            setForm((current) => ({
              ...current,
              complaintDate: value,
              todoDueDate: todoDueDateTouched ? current.todoDueDate : addDays(value, 2),
            }));
          }}
          required
        />

        <Field
          label="Issue"
          value={form.issue}
          onChange={(event) => updateForm("issue", event.target.value)}
          required
          placeholder="Example: Restrooms not cleaned properly"
        />

        <SelectField label="Priority" value={form.priority} onChange={(event) => updateForm("priority", event.target.value)}>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
          <option>Urgent</option>
        </SelectField>

        <SelectField label="Status" value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
          <option>Open</option>
          <option>Pending</option>
          <option>Needs Attention</option>
          <option>Closed</option>
        </SelectField>

        <SelectField label="Complaint validity" value={form.complaintValidity} onChange={(event) => updateForm("complaintValidity", event.target.value)}>
          <option>Valid</option>
          <option>Not Valid</option>
          <option>Subjective</option>
          <option>Needs Review</option>
        </SelectField>

        <Field
          label="Reported by"
          optional
          value={form.reportedBy}
          onChange={(event) => updateForm("reportedBy", event.target.value)}
          placeholder="Customer, manager, office..."
        />

        <SelectField
          label="Manager"
          hint="Responsible for following up. Also gets the To-Do that is created when you save."
          value={form.assignedTo}
          onChange={(event) => updateForm("assignedTo", event.target.value)}
          required
          disabled={loadingManagers}
        >
          <option value="">{loadingManagers ? "Loading managers…" : "Select manager"}</option>
          {managers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>

        <Field
          label="Last follow-up / follow-up date"
          optional
          type="date"
          value={form.lastFollowUp}
          onChange={(event) => updateForm("lastFollowUp", event.target.value)}
        />

        <Field
          label="Follow-up To-Do due date"
          hint={'Due date for the "Complaint Follow-Up" To-Do created when you save. Starts at 2 days after the complaint date.'}
          type="date"
          value={form.todoDueDate}
          onChange={(event) => {
            setTodoDueDateTouched(true);
            updateForm("todoDueDate", event.target.value);
          }}
        />

        <TextAreaField
          label="Notes"
          optional
          rows={5}
          value={form.notes}
          onChange={(event) => updateForm("notes", event.target.value)}
          placeholder="Add details, customer comments, photos reference, or follow-up instructions..."
        />

        <Card title="Photos">
          <p className="ui-card-text">
            Up to {MAX_COMPLAINT_PHOTOS} photos per complaint, max {MAX_PHOTO_SIZE_MB} MB each. {selectedPhotos.length} of {MAX_COMPLAINT_PHOTOS}{" "}
            selected.
          </p>
          <p className="ui-card-text">
            Add photos showing the issue, before/after condition, or customer concern. Photos will be saved in Google Drive under CWO Photos.
          </p>

          <div style={{ marginTop: 12 }}>
            <label className="ui-btn ui-btn-second" aria-disabled={selectedPhotos.length >= MAX_COMPLAINT_PHOTOS}>
              Choose photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                disabled={selectedPhotos.length >= MAX_COMPLAINT_PHOTOS}
                className="ui-visually-hidden"
              />
            </label>
          </div>

          {selectedPhotos.length >= MAX_COMPLAINT_PHOTOS ? <p className="ui-field-error">Maximum photo limit reached for this complaint.</p> : null}

          {selectedPhotos.length > 0 && (
            <div className="ui-three" style={{ marginTop: 12 }}>
              {selectedPhotos.map((photo, index) => (
                <div key={`${photo.file.name}-${index}`} className="ui-stat">
                  <Image
                    src={photo.previewUrl}
                    alt={`Selected complaint photo ${index + 1}`}
                    width={280}
                    height={112}
                    unoptimized
                    style={{ width: "100%", height: 112, objectFit: "cover", borderRadius: 8 }}
                  />
                  <p className="ui-strong">Photo {index + 1}</p>
                  <p className="ui-muted" style={{ overflowWrap: "anywhere" }}>
                    {photo.file.name}
                  </p>
                  <BigButton kind="quiet" onClick={() => removeSelectedPhoto(index)} aria-label={`Remove photo ${index + 1}`}>
                    Remove
                  </BigButton>
                </div>
              ))}
            </div>
          )}
        </Card>

        <PinSwitch info={pinInfo} type="complaint" value={pinChoice} onChange={setPinPicked} disabled={saving} />

        <div className="ui-actionbar">
          <BigButton type="submit" busy={saving} busyLabel="Saving…">
            Save complaint
          </BigButton>
        </div>
      </form>
    </Screen>
  );
}

export default function NewComplaintPage() {
  return (
    <Suspense
      fallback={
        <div className="ui-screen">
          <SkeletonList rows={3} />
        </div>
      }
    >
      <NewComplaintPageContent />
    </Suspense>
  );
}
