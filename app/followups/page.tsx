"use client";

import { useState } from "react";
import Link from "next/link";
import { accounts, followups } from "../data";

export default function FollowUpsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const [followupList, setFollowupList] = useState(
    followups.map((followup) => ({
      ...followup,
      updateNote: "",
    }))
  );

  const [newFollowup, setNewFollowup] = useState({
    accountId: accounts[0]?.id || 1,
    accountName: accounts[0]?.name || "",
    dueDate: new Date().toISOString().split("T")[0],
    assignedTo: "Andrés",
    note: "",
    status: "Pending",
    updateNote: "",
  });

  function handleAccountChange(accountIdValue: string) {
    const selectedAccountId = Number(accountIdValue);

    const selectedAccount = accounts.find(
      (account) => account.id === selectedAccountId
    );

    if (!selectedAccount) return;

    setNewFollowup({
      ...newFollowup,
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
    });
  }

  function addFollowup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newFollowup.accountName || !newFollowup.dueDate || !newFollowup.note) {
      alert("Please complete account, due date, and follow-up note.");
      return;
    }

    const followupToAdd = {
      id: followupList.length + 1,
      accountId: newFollowup.accountId,
      accountName: newFollowup.accountName,
      dueDate: newFollowup.dueDate,
      assignedTo: newFollowup.assignedTo,
      note: newFollowup.note,
      status: newFollowup.status,
      updateNote: "",
    };

    setFollowupList([followupToAdd, ...followupList]);

    setNewFollowup({
      accountId: accounts[0]?.id || 1,
      accountName: accounts[0]?.name || "",
      dueDate: new Date().toISOString().split("T")[0],
      assignedTo: "Andrés",
      note: "",
      status: "Pending",
      updateNote: "",
    });
  }

  function updateStatus(id: number, newStatus: string) {
    setFollowupList((currentFollowups) =>
      currentFollowups.map((followup) =>
        followup.id === id ? { ...followup, status: newStatus } : followup
      )
    );
  }

  function updateNote(id: number, newNote: string) {
    setFollowupList((currentFollowups) =>
      currentFollowups.map((followup) =>
        followup.id === id ? { ...followup, updateNote: newNote } : followup
      )
    );
  }

  const filteredFollowups = followupList.filter((followup) => {
    const relatedAccount = accounts.find(
      (account) => account.id === followup.accountId
    );

    const searchText = `
      ${followup.accountName}
      ${followup.dueDate}
      ${followup.assignedTo}
      ${followup.note}
      ${followup.status}
      ${followup.updateNote}
      ${relatedAccount?.subcontractor || ""}
      ${relatedAccount?.manager || ""}
      ${relatedAccount?.accountStatus || ""}
      ${relatedAccount?.accountHealth || ""}
    `.toLowerCase();

    return searchText.includes(searchTerm.toLowerCase());
  });

  const pendingFollowups = filteredFollowups.filter(
    (followup) => followup.status !== "Completed"
  ).length;

  const completedFollowups = filteredFollowups.filter(
    (followup) => followup.status === "Completed"
  ).length;

  const needsManagerReview = filteredFollowups.filter(
    (followup) => followup.status === "Needs Manager Review"
  ).length;

  return (
    <main className="ui-screen">
      <div className="ui-screen-body">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="ui-screen-title">Follow-Ups</h1>
            <p className="ui-muted">
              Track pending account follow-ups, assigned responsibility, due
              dates, subcontractor context, completion status, and follow-up
              notes.
            </p>
          </div>

          <Link
            href="/"
            className="ui-btn ui-btn-second"
          >
            Back to Dashboard
          </Link>
        </div>

        <form
          onSubmit={addFollowup}
          className="ui-card"
        >
          <h2 className="ui-card-title">
            Add New Follow-Up
          </h2>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="ui-label">
                Account
              </label>
              <select
                value={newFollowup.accountId}
                onChange={(event) => handleAccountChange(event.target.value)}
                className="ui-input w-full"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} - {account.subcontractor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">
                Due Date
              </label>
              <input
                type="date"
                value={newFollowup.dueDate}
                onChange={(event) =>
                  setNewFollowup({
                    ...newFollowup,
                    dueDate: event.target.value,
                  })
                }
                className="ui-input w-full"
              />
            </div>

            <div>
              <label className="ui-label">
                Assigned To
              </label>
              <select
                value={newFollowup.assignedTo}
                onChange={(event) =>
                  setNewFollowup({
                    ...newFollowup,
                    assignedTo: event.target.value,
                  })
                }
                className="ui-input w-full"
              >
                <option value="Andrés">Andrés</option>
                <option value="Greg">Greg</option>
                <option value="Drew">Drew</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.subcontractor}>
                    {account.subcontractor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">
                Status
              </label>
              <select
                value={newFollowup.status}
                onChange={(event) =>
                  setNewFollowup({
                    ...newFollowup,
                    status: event.target.value,
                  })
                }
                className="ui-input w-full"
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Needs Manager Review">
                  Needs Manager Review
                </option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="ui-label">
              Follow-Up Note
            </label>
            <textarea
              value={newFollowup.note}
              onChange={(event) =>
                setNewFollowup({ ...newFollowup, note: event.target.value })
              }
              placeholder="Example: Revisit account, confirm issue was corrected, call customer, follow up with subcontractor..."
              rows={3}
              className="ui-input w-full"
            />
          </div>

          <button
            type="submit"
            className="ui-btn ui-btn-main"
          >
            Add Follow-Up
          </button>

          <p className="ui-muted">
            Phase 2 note: This adds the follow-up on-screen. Permanent saving
            comes next when we connect storage.
          </p>
        </form>

        <div className="ui-card">
          <label className="ui-label">
            Search Follow-Ups
          </label>

          <input
            type="text"
            placeholder="Search by account, subcontractor, manager, assigned person, due date, status, or notes..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="ui-input w-full"
          />

          {searchTerm && (
            <p className="ui-muted">
              Showing {filteredFollowups.length} result
              {filteredFollowups.length === 1 ? "" : "s"} for “{searchTerm}”
            </p>
          )}
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="ui-card">
            <p className="ui-muted">Follow-Ups Showing</p>
            <p className="ui-stat-value">
              {filteredFollowups.length}
            </p>
          </div>

          <div className="ui-card">
            <p className="ui-muted">Pending / In Progress</p>
            <p className="ui-stat-value">
              {pendingFollowups}
            </p>
          </div>

          <div className="ui-card">
            <p className="ui-muted">Needs Review</p>
            <p className="ui-stat-value">
              {needsManagerReview}
            </p>
          </div>

          <div className="ui-card">
            <p className="ui-muted">Completed</p>
            <p className="ui-stat-value">
              {completedFollowups}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {filteredFollowups.map((followup) => {
            const relatedAccount = accounts.find(
              (account) => account.id === followup.accountId
            );

            return (
              <div key={followup.id} className="ui-card">
                <div className="grid gap-4 md:grid-cols-5">
                  <div>
                    <p className="ui-muted">Due Date</p>
                    <p className="ui-strong">
                      {followup.dueDate}
                    </p>
                  </div>

                  <div>
                    <p className="ui-muted">Account</p>
                    <p className="ui-strong">
                      {followup.accountName}
                    </p>
                  </div>

                  <div>
                    <p className="ui-muted">Subcontractor</p>
                    <p className="ui-strong">
                      {relatedAccount?.subcontractor || "Not connected"}
                    </p>
                  </div>

                  <div>
                    <p className="ui-muted">Assigned To</p>
                    <p className="ui-strong">
                      {followup.assignedTo}
                    </p>
                  </div>

                  <div>
                    <p className="ui-muted">Status</p>
                    <select
                      value={followup.status}
                      onChange={(event) =>
                        updateStatus(followup.id, event.target.value)
                      }
                      className="ui-input w-full"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Needs Manager Review">
                        Needs Manager Review
                      </option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="ui-muted">Account Status</p>
                    <p className="ui-strong">
                      {relatedAccount?.accountStatus || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="ui-muted">Account Health</p>
                    <p className="ui-strong">
                      {relatedAccount?.accountHealth || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="ui-muted">Manager</p>
                    <p className="ui-strong">
                      {relatedAccount?.manager || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border p-4">
                  <p className="ui-muted">Original Follow-Up Note</p>
                  <p className="ui-muted">{followup.note}</p>
                </div>

                <div className="mt-4">
                  <label className="ui-label">
                    Add Follow-Up Update
                  </label>

                  <textarea
                    value={followup.updateNote}
                    onChange={(event) =>
                      updateNote(followup.id, event.target.value)
                    }
                    placeholder="Example: Spoke with subcontractor, issue corrected, customer notified..."
                    rows={3}
                    className="ui-input w-full"
                  />

                  {followup.updateNote && (
                    <div className="mt-3 rounded-lg bg-blue-50 p-3">
                      <p className="ui-strong">
                        Latest Update
                      </p>
                      <p className="ui-muted">
                        {followup.updateNote}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredFollowups.length === 0 && (
            <div className="ui-card">
              No follow-ups found. Try a different search.
            </div>
          )}
        </div>

        <div className="ui-card">
          <h2 className="ui-card-title">
            Phase 2 Follow-Up Goal
          </h2>
          <p className="ui-muted">
            This page allows Cleaning World to add follow-ups, update status,
            add progress notes, and see subcontractor/account context for each
            follow-up.
          </p>
        </div>
      </div>
    </main>
  );
}