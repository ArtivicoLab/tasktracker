// Domain types — mirror the Google Sheet schema (see schema.ts).

export type Priority = "VeryLow" | "Low" | "Medium" | "High" | "VeryHigh";
export type Status =
  | "NotStarted"
  | "InProgress"
  | "OnHold"
  | "Pending"
  | "Delayed"
  | "Completed"
  | "Cancelled";

export type Frequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | `every_n_weeks:${number}`
  | "monthly"
  | `every_n_months:${number}`
  | "yearly";

export interface Task {
  id: string;
  title: string;
  notes: string;
  category: string;
  priority: Priority;
  status: Status;
  assignee: string; // task owner / "assigned to" — "" = nobody
  dueDate: string; // ISO yyyy-mm-dd, "" allowed
  recurrenceId: string; // "" = one-time
  occurrenceDate: string; // which occurrence a materialized recurring row is
  remind: boolean;
  calendarEventId: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recurrence {
  id: string;
  title: string;
  notes: string;
  category: string;
  priority: Priority;
  assignee: string; // task owner / "assigned to" — "" = nobody
  frequency: Frequency;
  anchorDate: string; // ISO yyyy-mm-dd — first occurrence
  endDate: string; // optional
  remind: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  name: string; // what to call the user in greetings ("" = not set yet)
  weekStart: 0 | 1; // 0 = Sunday, 1 = Monday
  theme: "auto" | "light" | "dark";
  digestTime: string; // "" = off, else "HH:mm"
  digestEventId: string; // Calendar event id for the digest — local-only, per device (Settings isn't a synced Sheet tab)
  categories: string[]; // user-editable task/recurrence categories (add/rename/remove)
  categoryColors: Record<string, string>; // category name -> chosen swatch token; falls back to the auto-assigned color if unset
  hiddenRoutes: string[]; // nav sections the user has hidden (still reachable by URL)
  householdMembers: string[]; // shared name list — feeds Task/Recurrence "Assigned to"
  tabBarRoutes: string[]; // pinned routes shown in the mobile bottom bar, in order ("more" is always appended, never stored here)
  accessCode: string; // Etsy purchase code the buyer entered ("" = not activated)
  activated: boolean; // true once a valid accessCode was entered — unlocks Google Sheets connect
  hideAtsHint?: boolean;
  tourDone?: boolean;
}

/** A calendar-facing occurrence: either computed (virtual) or backed by a real Task row. */
export interface Occurrence {
  key: string; // `${recurrenceId}:${date}` for recurring, or task id
  date: string; // ISO yyyy-mm-dd
  title: string;
  category: string;
  priority: Priority;
  assignee: string;
  recurrenceId: string;
  taskId?: string; // present when materialized
  status: Status;
  remind: boolean;
  virtual: boolean; // true = not yet a real Tasks row
}

export const PRIORITIES: Priority[] = [
  "VeryLow",
  "Low",
  "Medium",
  "High",
  "VeryHigh",
];
// Order mirrors the reference "STATUS" legend (Task Tracker slide).
export const STATUSES: Status[] = [
  "Completed",
  "Delayed",
  "OnHold",
  "Pending",
  "NotStarted",
  "InProgress",
  "Cancelled",
];
export const DEFAULT_CATEGORIES = [
  "Home",
  "Work",
  "Health",
  "Finance",
  "Growth",
];
