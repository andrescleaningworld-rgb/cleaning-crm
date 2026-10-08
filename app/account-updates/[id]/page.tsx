"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BigButton, Card, EmptyState, ErrorBox, LABELS, MoreMenu, Screen, SkeletonList } from "@/app/ui";

type RawAccountUpdate = {
  id?: string;
  "Update ID"?: string;
  date?: string;
  "Update Date"?: string;
  accountId?: string;
  "Account ID"?: string;
  accountName?: string;
  "Account Name"?: string;
  Account?: string;
  updateType?: string;
  "Update Type"?: string;
  Type?: string;
  manager?: string;
  Manager?: string;
  "Created By"?: string;
  notes?: string;
  Notes?: string;
  "Update Notes"?: string;
  Description?: string;
  notifyEmail?: string;
  "Notify Email"?: string;
  Email?: string;
};

type AccountUpdate = {
  id: string;
  date: string;
  dateRaw: string;
  accountId: string;
  accountName: string;
  updateType: string;
  manager: string;
  notes: string;
  notifyEmail: string;
};

function cleanText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function createIdFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "-");
}

function formatDate(value: string) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US");
}

function mapRawAccountUpdate(
  raw: RawAccountUpdate,
  index: number
): AccountUpdate {
  const dateRaw = cleanText(raw["Update Date"] || raw.date);

  return {
    id: cleanText(raw["Update ID"] || raw.id, `update-${index + 1}`),
    date: formatDate(dateRaw),
    dateRaw,
    accountId: cleanText(raw["Account ID"] || raw.accountId, ""),
    accountName: cleanText(
      raw["Account Name"] || raw.accountName || raw.Account,
      "Unnamed Account"
    ),
    updateType: cleanText(
      raw["Update Type"] || raw.updateType || raw.Type,
      "General Update"
    ),
    manager: cleanText(raw.Manager || raw.manager || raw["Created By"], "N/A"),
    notes: cleanText(
      raw.Notes || raw.notes || raw["Update Notes"] || raw.Description,
      "N/A"
    ),
    notifyEmail: cleanText(raw["Notify Email"] || raw.notifyEmail || raw.Email),
  };
}

function getParamId(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value || "";

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export default function AccountUpdateDetailPage() {
  const params = useParams();

  const updateId = useMemo(() => {
    return getParamId(params.id);
  }, [params.id]);

  const [updates, setUpdates] = useState<AccountUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadUpdates() {
      try {
        const response = await fetch("/api/account-updates", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Could not load account updates.");
        }

        const rawUpdates =
          result.accountUpdates || result.updates || result.data || [];

        const mappedUpdates: AccountUpdate[] = rawUpdates
          .map(mapRawAccountUpdate)
          .filter((update: AccountUpdate) => {
            return update.accountName !== "Unnamed Account" || update.notes !== "N/A";
          });

        setUpdates(mappedUpdates);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load account update details."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadUpdates();
  }, []);

  const update = updates.find((item) => item.id === updateId);

  if (isLoading) {
    return (
      <Screen title="Account Update" backHref="/account-updates">
        <SkeletonList rows={2} />
      </Screen>
    );
  }

  if (errorMessage) {
    return (
      <Screen title="Account Update" backHref="/account-updates">
        <ErrorBox title="The update did not load." text={errorMessage} />
      </Screen>
    );
  }

  if (!update) {
    return (
      <Screen title="Account Update" backHref="/account-updates">
        <EmptyState
          title="Account update not found"
          text="This update could not be found. Its link may have changed if the sheet row has no permanent Update ID yet."
          action={
            <BigButton kind="second" href="/account-updates">
              Back to Account Updates
            </BigButton>
          }
        />
      </Screen>
    );
  }

  const accountLink = `/accounts/${
    update.accountId || createIdFromName(update.accountName)
  }`;

  return (
    <Screen
      title={update.updateType}
      subtitle={update.accountName}
      backHref="/account-updates"
      headerRight={<MoreMenu items={[{ label: LABELS.print, onSelect: () => window.print() }]} />}
      action={<BigButton href={accountLink}>Go to account</BigButton>}
    >
      <style jsx global>{`
        @media print {
          /* Same opt-in contract as .account-packet-print-view in
             globals.css: that shared rule hides everything in <body> and
             re-shows only a page's own "-print-view" container. The summary
             card below is reused directly as the print view (no separate
             duplicate DOM) since it is already a single simple card. */
          .account-update-print-view,
          .account-update-print-view * {
            visibility: visible;
          }

          .account-update-print-view {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: #fff;
          }
        }
      `}</style>

      <div className="account-update-print-view">
        <Card title="Update Summary">
          <dl className="ui-details">
            <div className="ui-detail">
              <dt>Date</dt>
              <dd>{update.date}</dd>
            </div>
            <div className="ui-detail">
              <dt>Account</dt>
              <dd>
                <Link href={accountLink} className="ui-link">
                  {update.accountName}
                </Link>
              </dd>
            </div>
            <div className="ui-detail">
              <dt>Update Type</dt>
              <dd>{update.updateType}</dd>
            </div>
            <div className="ui-detail">
              <dt>Manager / Created By</dt>
              <dd>{update.manager}</dd>
            </div>
            <div className="ui-detail ui-detail-full">
              <dt>Notify Email</dt>
              <dd>{update.notifyEmail || "None"}</dd>
            </div>
            <div className="ui-detail ui-detail-full">
              <dt>Full Notes</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>{update.notes}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </Screen>
  );
}
