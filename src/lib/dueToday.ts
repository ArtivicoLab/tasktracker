// One shared "what's due today" calculation — used by the Sidebar/TabBar nav
// badge, the browser-tab title/favicon badge (components/TabNotifier.tsx),
// and the Dashboard's own badge. Kept in ONE place instead of several call
// sites computing their own count so the nav badge's total can never drift
// out of sync with the Dashboard's own number.
import { dueCountOn } from "../features/tasks/agenda";
import type { Recurrence, Task } from "./types";

export interface DueTodayBreakdown {
  tasks: number;
  total: number;
}

export function computeDueToday(
  tasks: Task[],
  recurrences: Recurrence[],
  date: string
): DueTodayBreakdown {
  const taskCount = dueCountOn(tasks, recurrences, date);
  return { tasks: taskCount, total: taskCount };
}
