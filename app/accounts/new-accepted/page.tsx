"use client";

// "New Accepted Account": the office's form for a customer who just accepted
// an estimate. Save makes the account (Status "New - setting up"), starts its
// 8 steps and pins it in the manager's square on the Pin Board (the manager
// gets the usual board text). Then it opens the account, where the big green
// button is step 1. Server: app/api/account-flow (action "create").

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton, Card, ErrorBox, Field, Screen, SelectField, showToast } from "@/app/ui";
import GoogleAddressAutocompleteInput, { type PlaceAddressDetails } from "@/app/components/GoogleAddressAutocompleteInput";

type Place = { address: string; city: string; state: string; zip: string; latitude: string; longitude: string };
const NO_PLACE: Place = { address: "", city: "", state: "", zip: "", latitude: "", longitude: "" };

export default function NewAcceptedAccountPage() {
  const router = useRouter();
  const [accountName, setAccountName] = useState("");
  const [place, setPlace] = useState<Place>(NO_PLACE);
  const [price, setPrice] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [manager, setManager] = useState("");
  const [managers, setManagers] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/managers", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const names = (data as { name?: string; status?: string }[])
          .filter((row) => String(row.status ?? "").trim().toLowerCase() !== "inactive")
          .map((row) => String(row.name ?? "").trim())
          .filter(Boolean);
        setManagers(Array.from(new Set(names)).sort());
      })
      .catch(() => setManagers([]));
  }, []);

  const missing = useMemo(() => {
    if (!accountName.trim()) return "Type the customer name.";
    if (!manager) return "Pick the account manager.";
    if (email.trim() && !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email.trim())) return "That email does not look right.";
    return "";
  }, [accountName, manager, email]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missing) {
      setError(missing);
      return;
    }
    setSaving(true);
    setError("");
    try {
      // The estimate goes up first (same place as "Add accepted estimate").
      let estimateUrl = "";
      let estimateName = "";
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const uploaded = await fetch("/api/handoffs/estimate", { method: "POST", body: form });
        const data = (await uploaded.json().catch(() => ({}))) as { success?: boolean; error?: string; url?: string; name?: string };
        if (!uploaded.ok || !data.success || !data.url) throw new Error(data.error || "The estimate did not upload. Try again.");
        estimateUrl = data.url;
        estimateName = data.name ?? file.name;
      }
      const response = await fetch("/api/account-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", accountName: accountName.trim(), ...place, monthlyRevenue: price, contactName: contactName.trim(), email: email.trim(), manager, estimateUrl, estimateName }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; accountId?: string };
      if (!response.ok || !data.success || !data.accountId) throw new Error(data.error || "The account was not saved. Try again.");
      showToast("Saved and pinned ✓");
      router.push(`/accounts/${encodeURIComponent(data.accountId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The account was not saved. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen
      title="New Accepted Account"
      backHref="/accounts"
      action={
        <BigButton type="submit" form="new-accepted-form" busy={saving} busyLabel="Saving…">
          Save
        </BigButton>
      }
    >
      {error ? <ErrorBox title="Not saved" text={error} /> : null}
      <form id="new-accepted-form" onSubmit={save}>
        <Card>
          <div className="ui-stack">
            <Field label="Customer name" value={accountName} onChange={(event) => setAccountName(event.target.value)} required disabled={saving} />
            <label className="ui-field">
              <span className="ui-label">Address</span>
              <GoogleAddressAutocompleteInput
                value={place.address}
                onChange={(value) => setPlace((current) => ({ ...current, address: value }))}
                onPlaceSelected={(details: PlaceAddressDetails) =>
                  setPlace({ address: details.address, city: details.city, state: details.state, zip: details.zip, latitude: details.latitude, longitude: details.longitude })
                }
                placeholder="Start typing, then pick it"
                className="ui-input"
              />
            </label>
            <Field label="Monthly price" inputMode="decimal" placeholder="2500" value={price} onChange={(event) => setPrice(event.target.value)} disabled={saving} />
            <Field label="Contact person" value={contactName} onChange={(event) => setContactName(event.target.value)} disabled={saving} />
            <Field
              label="Customer email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              hint="The Welcome Packet goes here."
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={saving}
            />
            <SelectField label="Account manager" value={manager} onChange={(event) => setManager(event.target.value)} disabled={saving}>
              <option value="">Pick the manager</option>
              {managers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
            <div className="ui-field">
              <label className="ui-label" htmlFor="estimate-file">
                Estimate PDF
              </label>
              <input id="estimate-file" type="file" accept="application/pdf,image/*" className="ui-input" disabled={saving} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <p className="ui-hint">{file ? `Chosen: ${file.name}` : "Or a photo of it. 10MB or smaller."}</p>
            </div>
          </div>
        </Card>
      </form>
    </Screen>
  );
}
