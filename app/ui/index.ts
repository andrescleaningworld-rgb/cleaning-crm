// UI kit for the redesigned screens. Import from "@/app/ui".
// Rules and component list: docs/MIGRATION_PLAN.md Part B. Live examples of
// every component in every state: /design-preview (staff only).

export {
  BigButton,
  Card,
  CardList,
  EmptyState,
  Field,
  Icon,
  Screen,
  SelectField,
  Skeleton,
  SkeletonList,
  StatusPill,
  TextAreaField,
  UiWordsProvider,
  useUiWords,
  type CardListColumn,
  type IconName,
  type StatusKind,
} from "./core";

export {
  AccountPicker,
  ConfirmSheet,
  ErrorBox,
  FilterChips,
  MoreMenu,
  PersonPicker,
  PhotoPicker,
  SaveStatus,
  SearchBar,
  Sheet,
  Stepper,
  Tabs,
  useSaveAction,
  type ChipOption,
  type MoreItem,
  type PickerOption,
  type SaveAction,
  type SaveState,
  type TabOption,
} from "./controls";

export { flushUndo, showToast, ToastRegion, undoable } from "./toast";

export { Counts, PullToRefresh, ShellTitle, SwipeRow, Tile, TileIconSvg, Tips, type CountItem, type TileIcon, type TipStep } from "./interact";

export { SHOW_TIPS_EVENT, useShell } from "./shell";

export {
  friendlyDate,
  GLOSSARY,
  LABELS,
  PROPOSED_RENAMES,
  todayIso,
  UI_WORDS,
  type UiLang,
  type UiWords,
} from "./words";
