// Small UI helpers shared across screens.

import type { Priority, Status } from "./types";
import { useSettings } from "../stores/useSettings";

// Fixed category -> hue mapping (a "deep ocean reef" palette — see
// tokens.css): Home=coral (--cat-pink, variable name kept for continuity;
// the hue is coral, not pink), Health=teal, Finance=gold (--cat-butter),
// Work=periwinkle/deep-water blue (--cat-sky), Growth=violet
// (--cat-lavender).
const FIXED: Record<string, string> = {
  Home: "var(--cat-pink)",
  Work: "var(--cat-sky)",
  Health: "var(--cat-teal)",
  Finance: "var(--cat-butter)",
  Growth: "var(--cat-lavender)",
};

// The "soft" (pill background) and "deep" (pill text / emphasis) companions
// for each FIXED category hue — same lookup shape as FIXED, keyed the same.
const FIXED_SOFT: Record<string, string> = {
  Home: "var(--cat-pink-soft)",
  Work: "var(--cat-sky-soft)",
  Health: "var(--cat-teal-soft)",
  Finance: "var(--cat-butter-soft)",
  Growth: "var(--cat-lavender-soft)",
};
const FIXED_DEEP: Record<string, string> = {
  Home: "var(--cat-pink-deep)",
  Work: "var(--cat-sky-deep)",
  Health: "var(--cat-teal-deep)",
  Finance: "var(--cat-butter-deep)",
  Growth: "var(--cat-lavender-deep)",
};

// A separate pool for user-created categories, distinct from the 5 tokens
// FIXED already claims — otherwise every custom category is guaranteed to
// hash onto a color one of the 5 defaults already uses (5 buckets, 5
// defaults = 100% collision), making it visually indistinguishable from an
// existing category.
const EXTENDED_PASTELS = [
  "var(--cat-mint)",
  "var(--cat-rose)",
  "var(--cat-gold)",
  "var(--cat-plum)",
  "var(--cat-steel)",
  "var(--cat-clay)",
];

// All swatch tokens are pickable for any category — used by the Settings
// color-tag picker. Order matches FIXED then EXTENDED_PASTELS.
export const PICKABLE_CATEGORY_COLORS = [
  "var(--cat-pink)", "var(--cat-sky)", "var(--cat-teal)", "var(--cat-butter)", "var(--cat-lavender)",
  "var(--cat-mint)", "var(--cat-rose)", "var(--cat-gold)", "var(--cat-plum)", "var(--cat-steel)", "var(--cat-clay)",
];

export function categoryColor(cat: string): string {
  const picked = useSettings.getState().categoryColors[cat];
  if (picked) return picked;
  if (FIXED[cat]) return FIXED[cat];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return EXTENDED_PASTELS[h % EXTENDED_PASTELS.length];
}

/** Pill background for a category badge — falls back to a neutral surface
    tint for a custom (hashed) category, which has no soft/deep companion. */
export function categoryPillBg(cat: string): string {
  return FIXED_SOFT[cat] ?? "var(--surface-2)";
}
/** Pill text/dot-emphasis color for a category badge. */
export function categoryPillInk(cat: string): string {
  return FIXED_DEEP[cat] ?? "var(--muted)";
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// A stable, colorful hash for anything that needs a consistent color from a
// string with no dedicated palette slot — e.g. an assignee avatar. Reuses
// the same pastel pool categories draw from, with no schema change needed
// since it's derived, not stored.
export function stringColor(s: string): string {
  return PICKABLE_CATEGORY_COLORS[hashString(s) % PICKABLE_CATEGORY_COLORS.length];
}

/** 1-2 letter initials for an assignee avatar, e.g. "Michael" -> "M". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  VeryLow: "Very Low",
  Low: "Low",
  Medium: "Medium",
  High: "High",
  VeryHigh: "Very High",
};

// Priority reuses the SAME 5-hue category family in a fixed ramp, on
// purpose — the design spec has no separate priority palette. VeryHigh gets
// the deep pink (extra weight at the top of the scale); the rest use the
// category mid-tones. See --pri-* in tokens.css.
export const PRIORITY_COLOR: Record<Priority, string> = {
  VeryLow: "var(--pri-verylow)",
  Low: "var(--pri-low)",
  Medium: "var(--pri-medium)",
  High: "var(--pri-high)",
  VeryHigh: "var(--pri-veryhigh)",
};

export const STATUS_LABEL: Record<Status, string> = {
  Completed: "Completed",
  Delayed: "Delayed",
  OnHold: "On Hold",
  Pending: "Pending",
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Cancelled: "Cancelled",
};

// Status also reuses the category hue family semantically (per spec:
// Completed=teal, In progress=gold, Delayed=pink, On hold=lavender,
// Pending/Not started=neutral gray). Cancelled isn't in the spec's 6-state
// list — kept neutral, same as Pending/Not started, rather than inventing a
// 6th hue. STATUS_COLOR is the "deep" (text/dot) tone; STATUS_PILL_BG is
// its "soft" (pill background) companion for the status badge.
export const STATUS_COLOR: Record<Status, string> = {
  Completed: "var(--cat-teal-deep)",
  InProgress: "var(--cat-butter-deep)",
  Delayed: "var(--cat-pink-deep)",
  OnHold: "var(--cat-lavender-deep)",
  Pending: "var(--muted)",
  NotStarted: "var(--muted)",
  Cancelled: "var(--muted)",
};

export const STATUS_PILL_BG: Record<Status, string> = {
  Completed: "var(--cat-teal-soft)",
  InProgress: "var(--cat-butter-soft)",
  Delayed: "var(--cat-pink-soft)",
  OnHold: "var(--cat-lavender-soft)",
  Pending: "var(--surface-2)",
  NotStarted: "var(--surface-2)",
  Cancelled: "var(--surface-2)",
};

export function money(n: number, symbol = "$"): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${symbol}${abs.toLocaleString(undefined, {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Human label for a recurrence frequency string. */
export function frequencyLabel(freq: string): string {
  switch (freq) {
    case "daily": return "Every day";
    case "weekly": return "Every week";
    case "biweekly": return "Every 2 weeks";
    case "monthly": return "Every month";
    case "yearly": return "Every year";
    default: {
      const [name, n] = freq.split(":");
      if (name === "every_n_weeks") return `Every ${n} weeks`;
      if (name === "every_n_months") return `Every ${n} months`;
      return freq;
    }
  }
}
