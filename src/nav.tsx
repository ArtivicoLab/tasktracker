// Single source of truth for navigation — consumed by the sidebar (desktop),
// the More hub (mobile) and the bottom tab bar.
import type { LucideIcon } from "lucide-react";
import type { Route } from "./router";
import {
  IconHome,
  IconTasks,
  IconCalendar,
  IconRepeat,
  IconSettings,
} from "./components/icons";

export interface NavItem {
  route: Route;
  label: string;
  Icon: LucideIcon;
  color: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { route: "dashboard", label: "Dashboard", Icon: IconHome, color: "var(--cat-sky)" },
      { route: "tasks", label: "Tasks", Icon: IconTasks, color: "var(--cat-lavender)" },
      { route: "calendar", label: "Calendar", Icon: IconCalendar, color: "var(--cat-teal)" },
      { route: "recurring", label: "Recurring", Icon: IconRepeat, color: "var(--cat-butter)" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  route: "settings",
  label: "Settings",
  Icon: IconSettings,
  color: "var(--muted)",
};

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

// Every route's display name, including the ones with no nav entry (More,
// Privacy) — used to label the "Coach Tour" button with the screen it'll
// actually tour, so it's obvious the tour is scoped to where you are.
export const ROUTE_LABELS: Record<Route, string> = {
  ...Object.fromEntries(ALL_NAV_ITEMS.map((i) => [i.route, i.label])),
  settings: SETTINGS_ITEM.label,
  more: "More",
  privacy: "Privacy",
  whatsnew: "What's New",
} as Record<Route, string>;

// The bottom tab bar (mobile) hardcodes these 4 + More as fixed chrome, so
// hiding a section never breaks that layout. There are no other modules left
// to hide in this app, so HIDEABLE_NAV_ITEMS is always empty — kept as an
// export since Settings still renders whatever it contains.
const CORE_ROUTES: Route[] = ["dashboard", "tasks", "calendar", "recurring"];
export const HIDEABLE_NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter(
  (i) => !CORE_ROUTES.includes(i.route)
);
