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
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Follow-Ups</h1>
            <p className="mt-2 text-gray-600">
              Track pending account follow-ups, assigned responsibility, due
              dates, subcontractor context, completion status, and follow-up
              notes.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
          >
            Back to Dashboard
          </Link>
        </div>

        <form
          onSubmit={addFollowup}
          className="mb-6 rounded-xl bg-white p-5 shadow"
        >
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            Add New Follow-Up
          </h2>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Account
              </label>
              <select
                value={newFollowup.accountId}
                onChange={(event) => handleAccountChange(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} - {account.subcontractor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
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
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
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
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
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
              <label className="mb-2 block text-sm font-medium text-gray-700">
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
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
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
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Follow-Up Note
            </label>
            <textarea
              value={newFollowup.note}
              onChange={(event) =>
                setNewFollowup({ ...newFollowup, note: event.target.value })
              }
              placeholder="Example: Revisit account, confirm issue was corrected, call customer, follow up with subcontractor..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <button
            type="submit"
            className="mt-4 rounded-lg bg-blue-700 px-5 py-3 font-medium text-white hover:bg-blue-600"
          >
            Add Follow-Up
          </button>

          <p className="mt-3 text-sm text-orange-700">
            Phase 2 note: This adds the follow-up on-screen. Permanent saving
            comes next when we connect storage.
          </p>
        </form>

        <div className="mb-6 rounded-xl bg-white p-5 shadow">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Search Follow-Ups
          </label>

          <input
            type="text"
            placeholder="Search by account, subcontractor, manager, assigned person, due date, status, or notes..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
          />

          {searchTerm && (
            <p className="mt-3 text-sm text-gray-500">
              Showing {filteredFollowups.length} result
              {filteredFollowups.length === 1 ? "" : "s"} for “{searchTerm}”
            </p>
          )}
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Follow-Ups Showing</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {filteredFollowups.length}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Pending / In Progress</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">
              {pendingFollowups}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Needs Review</p>
            <p className="mt-2 text-3xl font-bold text-purple-700">
              {needsManagerReview}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="mt-2 text-3xl font-bold text-green-700">
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
              <div key={followup.id} className="rounded-xl bg-white p-5 shadow">
                <div className="grid gap-4 md:grid-cols-5">
                  <div>
                    <p className="text-sm text-gray-500">Due Date</p>
                    <p className="font-medium text-gray-900">
                      {followup.dueDate}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Account</p>
                    <p className="font-medium text-gray-900">
                      {followup.accountName}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Subcontractor</p>
                    <p className="font-medium text-gray-900">
                      {relatedAccount?.subcontractor || "Not connected"}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Assigned To</p>
                    <p className="font-medium text-gray-900">
                      {followup.assignedTo}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <select
                      value={followup.status}
                      onChange={(event) =>
                        updateStatus(followup.id, event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
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
                    <p className="text-sm text-gray-500">Account Status</p>
                    <p className="font-medium text-gray-900">
                      {relatedAccount?.accountStatus || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Account Health</p>
                    <p className="font-medium text-gray-900">
                      {relatedAccount?.accountHealth || "N/A"}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Manager</p>
                    <p className="font-medium text-gray-900">
                      {relatedAccount?.manager || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border p-4">
                  <p className="text-sm text-gray-500">Original Follow-Up Note</p>
                  <p className="mt-1 text-gray-700">{followup.note}</p>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Add Follow-Up Update
                  </label>

                  <textarea
                    value={followup.updateNote}
                    onChange={(event) =>
                      updateNote(followup.id, event.target.value)
                    }
                    placeholder="Example: Spoke with subcontractor, issue corrected, customer notified..."
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                  />

                  {followup.updateNote && (
                    <div className="mt-3 rounded-lg bg-blue-50 p-3">
                      <p className="text-sm font-medium text-blue-900">
                        Latest Update
                      </p>
                      <p className="mt-1 text-sm text-blue-800">
                        {followup.updateNote}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredFollowups.length === 0 && (
            <div className="rounded-xl bg-white p-6 text-center text-gray-500 shadow">
              No follow-ups found. Try a different search.
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl bg-white p-5 shadow">
          <h2 className="text-xl font-semibold text-gray-900">
            Phase 2 Follow-Up Goal
          </h2>
          <p className="mt-2 text-gray-600">
            This page allows Cleaning World to add follow-ups, update status,
            add progress notes, and see subcontractor/account context for each
            follow-up.
          </p>
        </div>
      </div>
    </main>
  );
}