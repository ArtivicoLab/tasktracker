// Calendar quick-capture: type free text into a day cell and it becomes a
// one-off Task on that date, with an optional category pick.
import { useTasks } from "../stores/useTasks";

export interface CommitResult {
  id: string;
  date: string;
}

export function commitCapture(title: string, date: string, category?: string): CommitResult {
  const t = useTasks.getState().addTask({ title, dueDate: date, category: category || "Home" });
  return { id: t.id, date };
}
