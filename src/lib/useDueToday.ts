import { useEffect, useMemo, useState } from "react";
import { useTasks } from "../stores/useTasks";
import { todayISO } from "./dates";
import { computeDueToday, type DueTodayBreakdown } from "./dueToday";

/** Live "what's due today" breakdown, kept in sync with the underlying
    stores — see dueToday.ts's doc comment for why this is one shared hook
    instead of every consumer computing its own count. */
export function useDueToday(): DueTodayBreakdown {
  const { tasks, recurrences } = useTasks();
  const [today, setToday] = useState(todayISO());

  useEffect(() => {
    // Same trigger point main.tsx uses to catch a stale foreground tab: recheck on visibilitychange.
    const recheck = () => setToday((prev) => (document.visibilityState === "visible" ? todayISO() : prev));
    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  }, []);

  return useMemo(
    () => computeDueToday(tasks, recurrences, today),
    [tasks, recurrences, today]
  );
}
