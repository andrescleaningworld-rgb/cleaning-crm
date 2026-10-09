"use client";

// UI kit, part 2: SaveStatus + useSaveAction, ErrorBox, SearchBar,
// FilterChips, Tabs, ConfirmSheet, Stepper, MoreMenu, PersonPicker /
// AccountPicker, PhotoPicker.

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { BigButton, Icon, useUiWords, type IconName } from "./core";
import { showToast } from "./toast";

/* ---------- useSaveAction + SaveStatus ---------- */

export type SaveState = "idle" | "saving" | "saved" | "error";

export type SaveAction<Args extends unknown[]> = {
  state: SaveState;
  /** Plain-words problem when state is "error". */
  error: string;
  saving: boolean;
  /** Runs the save. Resolves true when it worked. Never throws. */
  run: (...args: Args) => Promise<boolean>;
  /** Runs the last save again with the same arguments. */
  retry: () => Promise<boolean>;
  reset: () => void;
};

/**
 * Wraps a save so the person always sees the result: "Saving…", then a green
 * "Saved" toast, or a red box with "Try again". Nothing fails silently.
 *
 *   const save = useSaveAction(async (name: string) => { await api(name); });
 *   <BigButton busy={save.saving} busyLabel={words.saving} onClick={() => save.run(name)}>Save</BigButton>
 *   <SaveStatus action={save} />
 *
 * `fn` should throw an Error whose message is safe to show (plain words).
 */
export function useSaveAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<unknown>,
  options: { savedMessage?: string; onSaved?: () => void } = {}
): SaveAction<Args> {
  const words = useUiWords();
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const lastArgs = useRef<Args | null>(null);
  const running = useRef(false);
  const fnRef = useRef(fn);
  const optionsRef = useRef(options);
  useEffect(() => {
    fnRef.current = fn;
    optionsRef.current = options;
  });

  const run = useCallback(
    async (...args: Args): Promise<boolean> => {
      // A second tap while saving does nothing (no double saves).
      if (running.current) return false;
      running.current = true;
      lastArgs.current = args;
      setState("saving");
      setError("");
      try {
        await fnRef.current(...args);
        setState("saved");
        showToast(optionsRef.current.savedMessage ?? words.saved);
        optionsRef.current.onSaved?.();
        return true;
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : words.couldNotSave);
        setState("error");
        return false;
      } finally {
        running.current = false;
      }
    },
    [words]
  );

  const retry = useCallback(() => (lastArgs.current ? run(...lastArgs.current) : Promise.resolve(false)), [run]);
  const reset = useCallback(() => {
    setState("idle");
    setError("");
  }, []);

  return { state, error, saving: state === "saving", run, retry, reset };
}

/** A red box that says what went wrong in plain words, with a "Try again" button. */
export function ErrorBox({ title, text, onRetry }: { title: string; text?: string; onRetry?: () => void }) {
  const words = useUiWords();
  return (
    <div className="ui-errorbox" role="alert">
      <p className="ui-errorbox-title">
        <Icon name="alert" />
        {title}
      </p>
      {text ? <p>{text}</p> : null}
      {onRetry ? (
        <div>
          <BigButton kind="second" onClick={onRetry}>
            {words.tryAgain}
          </BigButton>
        </div>
      ) : null}
    </div>
  );
}

/** Shows where a save is: "Saving…", "Saved", or the red box. Renders nothing when idle. */
export function SaveStatus<Args extends unknown[]>({ action }: { action: SaveAction<Args> }) {
  const words = useUiWords();
  if (action.state === "error") {
    return (
      <ErrorBox
        title={words.couldNotSave}
        text={action.error === words.couldNotSave ? undefined : action.error}
        onRetry={() => void action.retry()}
      />
    );
  }
  return (
    <div className="ui-savestatus" role="status" aria-live="polite">
      {action.state === "saving" ? (
        <span className="ui-savestatus ui-savestatus-saving">
          <span className="ui-spinner" aria-hidden="true" />
          {words.saving}
        </span>
      ) : action.state === "saved" ? (
        <span className="ui-savestatus ui-savestatus-saved">
          <Icon name="check" />
          {words.saved}
        </span>
      ) : null}
    </div>
  );
}

/* ---------- SearchBar ---------- */

/** The one search box of a list. */
export function SearchBar({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** What is being searched, for screen readers, e.g. "Search accounts". */
  label: string;
  placeholder?: string;
}) {
  const words = useUiWords();
  const id = useId();
  return (
    <div className="ui-search">
      <label htmlFor={id} className="ui-visually-hidden">
        {label}
      </label>
      <span className="ui-search-icon">
        <Icon name="search" />
      </span>
      <input
        id={id}
        type="search"
        className="ui-input"
        value={value}
        placeholder={placeholder ?? label}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          className="ui-btn ui-btn-quiet ui-btn-icon ui-search-clear"
          aria-label={words.clearSearch}
          onClick={() => onChange("")}
        >
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- FilterChips ---------- */

export type ChipOption<V extends string> = { value: V; label: string; count?: number };

/**
 * Up to 3 filter chips. One is always on. If a list needs more than 3
 * filters, the extra ones belong in the More menu.
 */
export function FilterChips<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ChipOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Names the group for screen readers, e.g. "Show". */
  label: string;
}) {
  if (process.env.NODE_ENV !== "production" && options.length > 3) {
    console.warn(`FilterChips "${label}": ${options.length} chips. The design rule is 3 at most.`);
  }
  return (
    <div className="ui-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ui-chip"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {typeof option.count === "number" ? ` (${option.count})` : ""}
        </button>
      ))}
    </div>
  );
}

/* ---------- Tabs ---------- */

export type TabOption<V extends string> = { value: V; label: string };

/** Tabs with arrow-key support. The caller shows the panel for `value`. */
export function Tabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    const move =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "Home" ? -index : event.key === "End" ? tabs.length - 1 - index : 0;
    if (!move) return;
    event.preventDefault();
    const next = (index + move + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="ui-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          className="ui-tab"
          aria-selected={tab.value === value}
          tabIndex={tab.value === value ? 0 : -1}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- ConfirmSheet ---------- */

/**
 * Asks before a destructive action only. `text` must spell out what will
 * happen ("This removes the visit. It cannot be brought back."). Uses the
 * native <dialog>, so focus is trapped and Escape cancels.
 */
export function ConfirmSheet({
  open,
  title,
  text,
  confirmLabel,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text: string;
  /** A verb that names the action: "Remove visit", never "OK". */
  confirmLabel: string;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const words = useUiWords();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-sheet"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 className="ui-sheet-title" id={titleId}>
        {title}
      </h2>
      <p className="ui-sheet-text" id={textId}>
        {text}
      </p>
      <div className="ui-sheet-actions">
        <BigButton kind="danger" busy={busy} busyLabel={busyLabel} onClick={onConfirm}>
          {confirmLabel}
        </BigButton>
        {/* Cancel comes first in the tab order's safe spot: it gets focus when the sheet opens. */}
        <BigButton kind="second" onClick={onCancel} disabled={busy} autoFocus>
          {words.cancel}
        </BigButton>
      </div>
    </dialog>
  );
}

/* ---------- Sheet ---------- */

/**
 * A panel over the screen for one small job (add a thing, send a thing, look
 * at a history): bottom sheet on a phone, centered box on desktop. Native
 * <dialog>: focus is trapped, Escape closes. `actions` is the sheet's own
 * one main button plus, usually, nothing else; a Close/Cancel button is
 * always added.
 */
export function Sheet({
  open,
  title,
  text,
  onClose,
  actions,
  closeLabel,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  text?: string;
  onClose: () => void;
  actions?: ReactNode;
  /** Defaults to "Cancel" when there are actions, "Close" when there are none. */
  closeLabel?: string;
  /** Blocks closing while a save is running. */
  busy?: boolean;
  children?: ReactNode;
}) {
  const words = useUiWords();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-sheet ui-sheet-form"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 className="ui-sheet-title" id={titleId}>
        {title}
      </h2>
      {text ? <p className="ui-sheet-text">{text}</p> : null}
      {/* Children mount only while open, so each opening starts fresh. */}
      {open ? <div className="ui-sheet-body">{children}</div> : null}
      <div className="ui-sheet-actions">
        {actions}
        <BigButton kind="second" onClick={onClose} disabled={busy}>
          {closeLabel ?? (actions ? words.cancel : words.close)}
        </BigButton>
      </div>
    </dialog>
  );
}

/* ---------- Stepper ---------- */

/** "Step 2 of 4" with a progress bar, for forms split into steps. */
export function Stepper({ step, total, label }: { step: number; total: number; label?: string }) {
  const words = useUiWords();
  const text = words.stepOf(step, total);
  return (
    <div className="ui-stepper" role="group" aria-label={text}>
      <span className="ui-stepper-count">
        {text}
        {label ? ` · ${label}` : ""}
      </span>
      <div className="ui-stepper-bar" aria-hidden="true">
        {Array.from({ length: total }).map((_, index) => (
          <span
            key={index}
            className={`ui-stepper-dot ${index + 1 < step ? "ui-stepper-dot-done" : index + 1 === step ? "ui-stepper-dot-now" : ""}`.trim()}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- MoreMenu ---------- */

export type MoreItem = {
  label: string;
  icon?: IconName;
  href?: string;
  onSelect?: () => void;
  /** Red text, for destructive actions (which still confirm with ConfirmSheet). */
  danger?: boolean;
};

/** The "More" button: everything that is not the screen's one main action. */
export function MoreMenu({ items, label }: { items: MoreItem[]; label?: string }) {
  const words = useUiWords();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className="ui-more" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="ui-btn ui-btn-second"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
        <span>{label ?? words.more}</span>
      </button>
      {open ? (
        <ul className="ui-more-list" id={menuId}>
          {items.map((item) => {
            const className = `ui-more-item ${item.danger ? "ui-more-item-danger" : ""}`.trim();
            const content = (
              <>
                {item.icon ? <Icon name={item.icon} /> : null}
                {item.label}
              </>
            );
            return (
              <li key={item.label}>
                {item.href ? (
                  <Link href={item.href} className={className} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={className}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- PersonPicker / AccountPicker ---------- */

export type PickerOption = {
  /** Never shown. Raw IDs stay out of sight. */
  id: string;
  name: string;
  /** Small second line, e.g. a city or a role. */
  detail?: string;
};

function Picker({
  options,
  value,
  onChange,
  label,
  searchLabel,
  emptyText,
}: {
  options: PickerOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  searchLabel: string;
  emptyText?: string;
}) {
  const words = useUiWords();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => `${option.name} ${option.detail ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="ui-field" role="group" aria-label={label}>
      <span className="ui-label">{label}</span>
      {options.length > 6 ? <SearchBar value={query} onChange={setQuery} label={searchLabel} /> : null}
      {shown.length === 0 ? (
        <span className="ui-hint">{emptyText ?? words.nothingFound}</span>
      ) : (
        <ul className="ui-picker-list">
          {shown.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="ui-picker-option"
                aria-pressed={option.id === value}
                onClick={() => onChange(option.id)}
              >
                <span>
                  {option.name}
                  {option.detail ? <span className="ui-hint"> · {option.detail}</span> : null}
                </span>
                {option.id === value ? <Icon name="check" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pick one person (manager, staff, sub) by name. */
export function PersonPicker(props: {
  options: PickerOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  searchLabel: string;
  emptyText?: string;
}) {
  return <Picker {...props} />;
}

/** Pick one account by name. */
export function AccountPicker(props: {
  options: PickerOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  searchLabel: string;
  emptyText?: string;
}) {
  return <Picker {...props} />;
}

/* ---------- PhotoPicker ---------- */

// Local preview of a file the person just picked. The blob: URL is set on
// the element inside the effect and revoked on cleanup, so nothing leaks.
function PhotoThumb({ file }: { file: File }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // next/image cannot optimize blob: URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt={file.name} />;
}

/**
 * Add photos from the camera or the gallery, see them, remove them. Holds
 * File objects only; the screen decides when and where to upload.
 */
export function PhotoPicker({
  files,
  onChange,
  label,
  max = 6,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label: string;
  max?: number;
}) {
  const words = useUiWords();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="ui-field" role="group" aria-label={label}>
      <span className="ui-label">{label}</span>
      {files.length > 0 ? (
        <div className="ui-photos">
          {files.map((file, index) => (
            <div className="ui-photo" key={`${file.name}-${file.lastModified}-${index}`}>
              <PhotoThumb file={file} />
              <button
                type="button"
                className="ui-btn ui-btn-icon ui-photo-remove"
                aria-label={`${words.removePhoto}: ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {files.length < max ? (
        <div>
          <BigButton kind="second" icon="camera" onClick={() => inputRef.current?.click()}>
            {words.addPhoto}
          </BigButton>
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (picked.length) onChange([...files, ...picked].slice(0, max));
          event.target.value = "";
        }}
      />
    </div>
  );
}
