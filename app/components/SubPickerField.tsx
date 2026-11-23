"use client";

// The searchable sub box: the same field and look as the account picker. Type
// part of a name, or tap the empty field for the whole list. Active subs only,
// unless `includeInactive` (a filter still has to find an old sub's to-dos).

import { useMemo, useState } from "react";
import { matchAccounts } from "@/app/components/AccountPickerField";
import { AutocompleteField, type SearchOption } from "@/app/sub-schedules/autocomplete";
import type { TaskSubOption } from "@/lib/pg/cw-now-tasks";

const optionOf = (sub: TaskSubOption): SearchOption => ({ id: sub.id, label: sub.name, detail: sub.inactive ? "Inactive" : "" });

export default function SubPickerField({
  label,
  subs,
  value,
  onChange,
  hint,
  includeInactive = false,
  loading = false,
}: {
  label: string;
  subs: TaskSubOption[];
  /** The sub's ID, "" = none picked. */
  value: string;
  onChange: (subId: string) => void;
  hint?: string;
  includeInactive?: boolean;
  /** The subs are still on their way. */
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => subs.filter((sub) => includeInactive || !sub.inactive).map((sub) => ({ ...sub, address: "", city: "" })), [subs, includeInactive]);
  const options = useMemo(() => (value ? [] : matchAccounts(list, query).map(optionOf)), [list, query, value]);
  const found = subs.find((sub) => sub.id === value);
  const selected: SearchOption | null = !value ? null : found ? optionOf(found) : { id: value, label: subs.length > 0 ? "Sub not found" : "Loading…" };

  return (
    <AutocompleteField
      label={label}
      placeholder="Type a sub name"
      hint={hint}
      query={query}
      onQueryChange={setQuery}
      options={options}
      loading={loading}
      selected={selected}
      onSelect={(option) => {
        onChange(option.id);
        setQuery("");
      }}
      onClear={() => {
        onChange("");
        setQuery("");
      }}
      minChars={0}
      emptyText="No subs found"
    />
  );
}
