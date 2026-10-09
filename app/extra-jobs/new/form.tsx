"use client";

// One quick form, under a minute: account, how it came in, what the job is,
// date, customer price, sub, sub pay, who sold it. Saving it also creates a
// one-time Sale (10% commission) and tells the office by email.
//
// The same form changes a job that is still on "Set up" (`editId`): every
// field can be changed, and the job's Sale is changed to match.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountPicker, BigButton, CHEER, EmptyState, ErrorBox, Field, Screen, SelectField, SkeletonList, TextAreaField, showToast } from "@/app/ui";
import { EXTRA_JOBS_RULE, SOURCES, checkNewExtraJob, todayDay, type ExtraJob, type ExtraJobSource, type FormChoices } from "@/lib/extraJobs";
import styles from "../extra-jobs.module.css";

type State = "loading" | "off" | "missing" | "locked" | "failed" | "ready";

export default function ExtraJobForm({ accountId: startAccountId = "", editId = "" }: { accountId?: string; editId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [choices, setChoices] = useState<FormChoices | null>(null);
  const [jobNumber, setJobNumber] = useState("");
  const [accountId, setAccountId] = useState(startAccountId);
  const [source, setSource] = useState<ExtraJobSource>("call");
  const [description, setDescription] = useState("");
  const [jobDate, setJobDate] = useState(() => todayDay());
  const [price, setPrice] = useState("");
  const [subId, setSubId] = useState("");
  const [subPay, setSubPay] = useState("");
  const [soldBy, setSoldBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/extra-jobs?view=form", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean } & Partial<FormChoices>;
      if (body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      const loaded: FormChoices = { accounts: body.accounts ?? [], subs: body.subs ?? [], sellers: body.sellers ?? [], me: body.me ?? "" };

      if (editId) {
        const jobResponse = await fetch(`/api/extra-jobs?id=${encodeURIComponent(editId)}`, { cache: "no-store" });
        if (jobResponse.status === 404) return setState("missing");
        const jobBody = (await jobResponse.json()) as { success?: boolean; job?: ExtraJob };
        const job = jobBody.job;
        if (!jobResponse.ok || jobBody.success !== true || !job) throw new Error("failed");
        if (job.status !== "setup") return setState("locked");
        // Whoever and whatever the job already names stays pickable, even if it is no longer on the lists.
        if (job.accountId && !loaded.accounts.some((option) => option.id === job.accountId)) loaded.accounts.unshift({ id: job.accountId, name: job.accountName, subId: job.subId, manager: "" });
        if (job.subId && !loaded.subs.some((option) => option.id === job.subId)) loaded.subs.unshift({ id: job.subId, name: job.subName });
        if (job.soldBy && !loaded.sellers.includes(job.soldBy)) loaded.sellers.unshift(job.soldBy);
        setJobNumber(job.jobNumber);
        setAccountId(job.accountId);
        setSource(job.source);
        setDescription(job.description);
        setJobDate(job.jobDate);
        setPrice(String(job.customerPrice));
        setSubId(job.subId);
        setSubPay(String(job.subPay));
        setSoldBy(job.soldBy);
      } else {
        // The person filling it in is usually the one who sold it.
        if (loaded.sellers.includes(loaded.me)) setSoldBy(loaded.me);
        // Coming from an account page: its usual sub is picked already.
        const start = loaded.accounts.find((option) => option.id === startAccountId);
        if (start && loaded.subs.some((sub) => sub.id === start.subId)) setSubId(start.subId);
      }
      setChoices(loaded);
      setState("ready");
    };
    load().catch(() => setState("failed"));
  }, [startAccountId, editId]);

  const account = choices?.accounts.find((option) => option.id === accountId) ?? null;
  const sub = choices?.subs.find((option) => option.id === subId) ?? null;
  const backHref = editId ? `/extra-jobs/${encodeURIComponent(editId)}` : startAccountId ? `/accounts/${encodeURIComponent(startAccountId)}` : "/extra-jobs";

  function pickAccount(id: string) {
    setAccountId(id);
    // The account's usual sub is the likely one; the manager can still change it.
    const picked = choices?.accounts.find((option) => option.id === id);
    if (picked && choices?.subs.some((option) => option.id === picked.subId)) setSubId(picked.subId);
  }

  async function save() {
    const input = {
      accountId: account?.id ?? "",
      accountName: account?.name ?? "",
      source,
      description,
      jobDate,
      // An empty box is "not filled in", not $0.
      customerPrice: price.trim() === "" ? Number.NaN : Number(price),
      subId: sub?.id ?? "",
      subName: sub?.name ?? "",
      subPay: subPay.trim() === "" ? Number.NaN : Number(subPay),
      soldBy,
    };
    const problem = checkNewExtraJob(input);
    if (problem) return setError(problem);
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/extra-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { action: "update", id: editId, ...input } : { action: "create", ...input }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; job?: ExtraJob; emailed?: boolean };
      if (!response.ok || body.success !== true || !body.job) throw new Error(body.error ?? "That did not save. Try again.");
      showToast(body.emailed === false ? "Saved. The email to the office did not go out." : CHEER.logged, body.emailed === false ? "bad" : "good");
      router.push(`/extra-jobs/${body.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen
      title={editId ? `Change extra job${jobNumber ? ` ${jobNumber}` : ""}` : "Extra job"}
      subtitle={editId ? "Its Sale is changed to match." : "Set it up here so it gets paid."}
      backHref={backHref}
      action={
        state === "ready" ? (
          <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
            {editId ? "Save changes" : "Save extra job"}
          </BigButton>
        ) : undefined
      }
    >
      {state === "loading" ? (
        <SkeletonList rows={4} />
      ) : state === "off" ? (
        <EmptyState title="Not set up here yet" text="Extra Jobs works once this database has its tables." />
      ) : state === "missing" ? (
        <EmptyState title="That extra job was not found" text="It may have been opened from an old link." />
      ) : state === "locked" ? (
        <EmptyState
          title="This job cannot be changed any more"
          text="A job can be changed only while it is on Set up. This one is done or cancelled."
          action={
            <BigButton kind="second" href={backHref}>
              Back to the job
            </BigButton>
          }
        />
      ) : state === "failed" || !choices ? (
        <ErrorBox title="The form did not load." onRetry={() => window.location.reload()} />
      ) : (
        <div className="ui-stack">
          {editId ? null : <p className={styles.rule}>{EXTRA_JOBS_RULE}</p>}

          {account ? (
            <div className={styles.picked}>
              <span>{account.name}</span>
              <BigButton kind="second" disabled={saving} onClick={() => setAccountId("")}>
                Change account
              </BigButton>
            </div>
          ) : (
            <AccountPicker
              options={choices.accounts.map((option) => ({ id: option.id, name: option.name }))}
              value={accountId}
              onChange={pickAccount}
              label="Account"
              searchLabel="Find the account"
              emptyText="No account with that name."
            />
          )}

          <div className="ui-field" role="group" aria-label="How it came in">
            <span className="ui-label">How it came in</span>
            <div className={styles.choices}>
              {SOURCES.map((option) => (
                <button key={option.value} type="button" className={styles.choice} aria-pressed={source === option.value} disabled={saving} onClick={() => setSource(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <TextAreaField label="What is the job?" hint="What the sub has to do. This prints on the work order." rows={3} maxLength={2000} value={description} disabled={saving} onChange={(event) => setDescription(event.target.value)} />

          <div className={styles.two}>
            <Field label="Date" type="date" value={jobDate} disabled={saving} onChange={(event) => setJobDate(event.target.value)} />
            <Field label="Customer price ($)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={price} disabled={saving} onChange={(event) => setPrice(event.target.value)} />
          </div>

          <div className={styles.two}>
            <SelectField label="Sub" value={subId} disabled={saving} onChange={(event) => setSubId(event.target.value)}>
              <option value="">Pick the sub</option>
              {choices.subs.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </SelectField>
            <Field label="Sub pay ($)" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={subPay} disabled={saving} onChange={(event) => setSubPay(event.target.value)} />
          </div>

          <SelectField label="Who sold it" hint="They get the 10% one-time commission. A Sale is created for it." value={soldBy} disabled={saving} onChange={(event) => setSoldBy(event.target.value)}>
            <option value="">Pick a person</option>
            {choices.sellers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectField>

          {error ? <ErrorBox title="Not saved yet." text={error} /> : null}
        </div>
      )}
    </Screen>
  );
}
