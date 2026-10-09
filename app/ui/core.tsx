"use client";

// UI kit, part 1: words context, icons, Screen, BigButton, Field, Card,
// CardList, StatusPill, EmptyState, Skeleton. Styles are the .ui-* classes
// in app/globals.css. See docs/MIGRATION_PLAN.md Part B for the rules.

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { clearShellScreen, setShellScreen } from "./shell";
import { ToastRegion } from "./toast";
import { UI_WORDS, type UiLang, type UiWords } from "./words";

/* ---------- words ---------- */

const WordsContext = createContext<UiWords>(UI_WORDS.en);

/** Wrap a crew / sub / customer screen to switch the kit's own words. Staff screens need nothing. */
export function UiWordsProvider({ lang, children }: { lang: UiLang; children: ReactNode }) {
  return <WordsContext.Provider value={UI_WORDS[lang] ?? UI_WORDS.en}>{children}</WordsContext.Provider>;
}

export function useUiWords(): UiWords {
  return useContext(WordsContext);
}

/* ---------- icons ---------- */

const ICON_PATHS = {
  back: "M15 5l-7 7 7 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  alert: "M12 8v5m0 3.5v.5M10.3 3.9L2.6 17.3A2 2 0 004.3 20h15.4a2 2 0 001.7-2.7L13.7 3.9a2 2 0 00-3.4 0z",
  off: "M6 12h12M12 3a9 9 0 100 18 9 9 0 000-18z",
  search: "M11 4a7 7 0 105 11.9l4 4M16 15.9A7 7 0 0011 4z",
  close: "M6 6l12 12M18 6L6 18",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4V8zm8 8a3 3 0 100-6 3 3 0 000 6z",
  inbox: "M4 13l2.5-8h11L20 13v6H4v-6zm0 0h5a3 3 0 006 0h5",
  chevron: "M9 5l7 7-7 7",
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Decorative by default (aria-hidden). Meaning always comes from the word next to it. */
export function Icon({ name, className = "ui-icon" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/* ---------- Screen ---------- */

/**
 * The frame of every redesigned screen: sticky header with a back arrow and
 * title, the content, and one main action pinned to the bottom (full width on
 * a phone, bottom-right on desktop).
 */
export function Screen({
  title,
  subtitle,
  backHref,
  onBack,
  headerRight,
  action,
  secondaryAction,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Where the back arrow goes. Leave out on top-level screens. */
  backHref?: string;
  onBack?: () => void;
  /** Usually a <MoreMenu />. */
  headerRight?: ReactNode;
  /** The one main action: a <BigButton />. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  children: ReactNode;
}) {
  const words = useUiWords();
  // The navy bar at the top of the app shows this screen's name and back arrow.
  // (onBack is usually a new function on every render, so the bar gets one
  // steady function that calls the latest one.)
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  const hasOnBack = Boolean(onBack);
  useEffect(() => {
    setShellScreen(title, backHref, hasOnBack ? () => onBackRef.current?.() : undefined);
    return () => clearShellScreen(title);
  }, [title, backHref, hasOnBack]);
  return (
    <div className="ui-screen">
      <header className="ui-screen-header">
        {backHref ? (
          <Link href={backHref} className="ui-btn ui-btn-quiet ui-btn-icon" aria-label={words.back}>
            <Icon name="back" />
          </Link>
        ) : onBack ? (
          <button type="button" onClick={onBack} className="ui-btn ui-btn-quiet ui-btn-icon" aria-label={words.back}>
            <Icon name="back" />
          </button>
        ) : null}
        <div className="ui-screen-titles">
          <h1 className="ui-screen-title">{title}</h1>
          {subtitle ? <p className="ui-screen-subtitle">{subtitle}</p> : null}
        </div>
        {headerRight}
      </header>
      <div className="ui-screen-body">{children}</div>
      {action || secondaryAction ? (
        <div className="ui-actionbar">
          {action}
          {secondaryAction}
        </div>
      ) : null}
      <ToastRegion />
    </div>
  );
}

/* ---------- BigButton ---------- */

type ButtonKind = "main" | "second" | "danger" | "quiet";

type BigButtonProps = {
  /** "main" is the one filled button of a screen. Default "main". */
  kind?: ButtonKind;
  /** Shows a spinner and blocks taps. Pair with busyLabel, e.g. "Saving…". */
  busy?: boolean;
  busyLabel?: string;
  icon?: IconName;
  /** Renders a link that looks like a button. */
  href?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export function BigButton({
  kind = "main",
  busy = false,
  busyLabel,
  icon,
  href,
  children,
  className = "",
  disabled,
  type = "button",
  ...rest
}: BigButtonProps) {
  const classes = `ui-btn ui-btn-${kind} ${className}`.trim();
  const content = (
    <>
      {busy ? <span className="ui-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      <span>{busy && busyLabel ? busyLabel : children}</span>
    </>
  );
  if (href && !disabled && !busy) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {content}
    </button>
  );
}

/* ---------- Field ---------- */

type FieldShellProps = {
  label: string;
  /** Short help under the label. */
  hint?: string;
  /** Plain-words problem. Shown in red and read to screen readers. */
  error?: string;
  /** Adds "(optional)" after the label. Fields are required unless marked. */
  optional?: boolean;
};

function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: FieldShellProps & { id: string; children: ReactNode }) {
  const words = useUiWords();
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={id}>
        {label}
        {optional ? <span className="ui-optional"> ({words.optional})</span> : null}
      </label>
      {hint ? (
        <span className="ui-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="ui-field-error" id={`${id}-error`} role="alert">
          <Icon name="alert" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

/** A labeled text input. Pass normal <input> props (type, value, onChange, inputMode…). */
export function Field({
  label,
  hint,
  error,
  optional,
  className = "",
  ...input
}: FieldShellProps & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = input.id ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        {...input}
        id={id}
        className={`ui-input ${className}`.trim()}
        required={input.required ?? !optional}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  className = "",
  ...input
}: FieldShellProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const id = input.id ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        {...input}
        id={id}
        className={`ui-input ${className}`.trim()}
        required={input.required ?? !optional}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  className = "",
  children,
  ...input
}: FieldShellProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const id = input.id ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select
        {...input}
        id={id}
        className={`ui-input ${className}`.trim()}
        required={input.required ?? !optional}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/* ---------- Card + CardList ---------- */

/** A panel. With href it is one big link; with onClick, one big button. */
export function Card({
  title,
  right,
  href,
  onClick,
  children,
}: {
  title?: string;
  /** Usually a <StatusPill />. */
  right?: ReactNode;
  href?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const inner = (
    <>
      {title || right ? (
        <div className="ui-card-row">
          {title ? <h2 className="ui-card-title">{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="ui-card">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="ui-card">
        {inner}
      </button>
    );
  }
  return <section className="ui-card">{inner}</section>;
}

export type CardListColumn<T> = {
  header: string;
  cell: (item: T) => ReactNode;
};

/**
 * A list of things. Always cards on a phone. With `columns` it becomes a
 * table from 900px up; the first column links to the item when `href` is set.
 */
export function CardList<T>({
  items,
  getKey,
  renderCard,
  columns,
  href,
  label,
}: {
  items: T[];
  getKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  columns?: CardListColumn<T>[];
  href?: (item: T) => string;
  /** Names the list for screen readers, e.g. "Accounts". */
  label: string;
}) {
  return (
    <>
      <ul className={`ui-cardlist ${columns ? "ui-cardlist-has-table" : ""}`.trim()} aria-label={label}>
        {items.map((item) => (
          <li key={getKey(item)}>{renderCard(item)}</li>
        ))}
      </ul>
      {columns ? (
        <div className="ui-table-wrap">
          <table className="ui-table" aria-label={label}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.header} scope="col">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={getKey(item)}>
                  {columns.map((column, index) => (
                    <td key={column.header}>
                      {index === 0 && href ? (
                        <Link href={href(item)} className="ui-table-rowlink">
                          {column.cell(item)}
                        </Link>
                      ) : (
                        column.cell(item)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/* ---------- StatusPill ---------- */

export type StatusKind = "done" | "waiting" | "needs-you" | "off";

const STATUS_ICON: Record<StatusKind, IconName> = {
  done: "check",
  waiting: "clock",
  "needs-you": "alert",
  off: "off",
};

/** Status is always color + word + icon. `children` replaces the default word (Done / Waiting / Needs you / Off). */
export function StatusPill({ kind, children }: { kind: StatusKind; children?: ReactNode }) {
  const words = useUiWords();
  const defaults: Record<StatusKind, string> = {
    done: words.statusDone,
    waiting: words.statusWaiting,
    "needs-you": words.statusNeedsYou,
    off: words.statusOff,
  };
  return (
    <span className={`ui-pill ui-pill-${kind}`}>
      <Icon name={STATUS_ICON[kind]} />
      {children ?? defaults[kind]}
    </span>
  );
}

/* ---------- EmptyState ---------- */

/** Shown instead of an empty list: says what is going on and offers the next step. */
export function EmptyState({
  title,
  text,
  action,
  icon = "inbox",
}: {
  title: string;
  text?: string;
  /** Usually a <BigButton kind="second" />. */
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="ui-empty">
      <Icon name={icon} className="ui-empty-icon" />
      <h2 className="ui-empty-title">{title}</h2>
      {text ? <p className="ui-empty-text">{text}</p> : null}
      {action}
    </div>
  );
}

/* ---------- Skeleton ---------- */

/** A gray placeholder while something loads. */
export function Skeleton({ height = 24, width = "100%" }: { height?: number; width?: number | string }) {
  return <span className="ui-skeleton" style={{ height, width }} aria-hidden="true" />;
}

/** Placeholder for a list of cards. Announces "Loading…" once to screen readers. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const words = useUiWords();
  return (
    <div className="ui-cardlist" role="status">
      <span className="ui-visually-hidden">{words.loading}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div className="ui-card" key={index} aria-hidden="true">
          <Skeleton height={24} width="60%" />
          <div style={{ height: 10 }} />
          <Skeleton height={18} width="90%" />
        </div>
      ))}
    </div>
  );
}
