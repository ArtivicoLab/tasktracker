import { useEffect, useMemo, useState } from "react";
import { Segmented } from "../../components/Segmented";
import { Chip, ChipRow } from "../../components/Chip";
import { Checkbox } from "../../components/Checkbox";
import { EmptyState } from "../../components/EmptyState";
import { HelpTip } from "../../components/HelpTip";
import { IconChevron, IconEdit, IconHeart, IconPlus, IconRepeat, IconTasks, IconTrash } from "../../components/icons";
import { TaskSheet } from "./TaskSheet";
import { TipBanner } from "../../components/TipBanner";
import { buildAgenda, sortAgenda, type AgendaItem } from "./agenda";
import { useTasks } from "../../stores/useTasks";
import { useSettings } from "../../stores/useSettings";
import { addDaysISO, daysBetween, dueLabel, todayISO } from "../../lib/dates";
import {
  categoryColor,
  categoryPillBg,
  categoryPillInk,
  initials,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_PILL_BG,
  stringColor,
} from "../../lib/ui";
import {
  PRIORITIES,
  STATUSES,
  type Priority,
  type Status,
  type Task,
} from "../../lib/types";
import { routeQuery } from "../../router";

type Seg = "today" | "upcoming" | "overdue" | "all";
const SEGS = [
  { value: "today" as Seg, label: "Today" },
  { value: "upcoming" as Seg, label: "Upcoming" },
  { value: "overdue" as Seg, label: "Overdue" },
  { value: "all" as Seg, label: "All" },
];

type Sort = "due" | "priority" | "status" | "name" | "assignee" | "daysleft" | "category";
const SORTS: { value: Sort; label: string }[] = [
  { value: "due", label: "Due date" },
  { value: "daysleft", label: "Days left" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assigned to" },
  { value: "category", label: "Category" },
  { value: "name", label: "Name" },
];

const PRI_RANK: Record<Priority, number> = {
  VeryHigh: 0, High: 1, Medium: 2, Low: 3, VeryLow: 4,
};

// A busy "All"/"Upcoming" segment can easily hold hundreds of rows — render
// them in pages instead of all at once (both for render cost and so the list
// doesn't feel like an endless wall). Resets to one page on any filter/segment
// change so switching tabs never lands mid-scroll on a stale page count.
const PAGE_SIZE = 20;

export function TasksScreen() {
  const { tasks, recurrences, toggleComplete, toggleOccurrence, deleteTask, materialize, setStatus } =
    useTasks();
  const { categories } = useSettings();
  const initialSeg = (routeQuery().get("seg") as Seg) || "today";
  const [seg, setSeg] = useState<Seg>(SEGS.some((s) => s.value === initialSeg) ? initialSeg : "today");
  const [catFilter, setCatFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [priFilter, setPriFilter] = useState<Priority | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [sort, setSort] = useState<Sort>("due");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<Task | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // A calendar click or a quick-add toast's "View" jumps here with ?id= —
  // open that exact task's editor instead of just landing on the list, which
  // otherwise still shows Today's segment even if the task is on another day.
  useEffect(() => {
    const id = routeQuery().get("id");
    if (!id) return;
    const t = useTasks.getState().tasks.find((x) => x.id === id);
    if (t) {
      setEditItem(t);
      setSheetOpen(true);
    }
  }, []);

  const today = todayISO();

  const agenda = useMemo(() => {
    const items = buildAgenda(tasks, recurrences, addDaysISO(today, -90), addDaysISO(today, 180));
    return sortAgenda(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, recurrences]);

  // assignee options come from the data
  const assignees = useMemo(
    () => Array.from(new Set(agenda.map((i) => i.assignee).filter(Boolean))).sort(),
    [agenda]
  );

  const daysLeft = (i: AgendaItem) => (i.date ? daysBetween(today, i.date) : Infinity);

  const filtered = useMemo(() => {
    const list = agenda.filter((it) => {
      if (!includeCompleted && it.done) return false;
      if (catFilter && it.category !== catFilter) return false;
      if (statusFilter && it.status !== statusFilter) return false;
      if (priFilter && it.priority !== priFilter) return false;
      if (assigneeFilter && it.assignee !== assigneeFilter) return false;
      if (seg === "today") return it.date === today;
      if (seg === "overdue") return it.date && it.date < today && !it.done;
      if (seg === "upcoming") return it.date && it.date > today;
      return true;
    });
    const dateCmp = (a: AgendaItem, b: AgendaItem) => {
      if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    };
    return list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      switch (sort) {
        case "priority": return PRI_RANK[a.priority] - PRI_RANK[b.priority] || dateCmp(a, b);
        case "status": return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || dateCmp(a, b);
        case "name": return a.title.localeCompare(b.title);
        case "assignee": return (a.assignee || "~").localeCompare(b.assignee || "~") || dateCmp(a, b);
        case "category": return a.category.localeCompare(b.category) || dateCmp(a, b);
        case "daysleft": return daysLeft(a) - daysLeft(b);
        default: return dateCmp(a, b);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, includeCompleted, catFilter, statusFilter, priFilter, assigneeFilter, seg, sort, today]);

  // Any change that reshuffles what's in the list should re-start pagination
  // at page 1 — otherwise switching from "All" to "Today" could silently show
  // zero rows because visibleCount was left high from a much longer list.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [seg, catFilter, statusFilter, priFilter, assigneeFilter, sort, includeCompleted]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  const counts = {
    overdue: agenda.filter((i) => i.date && i.date < today && !i.done).length,
  };

  // Categories with something due today or overdue — lit up in the filter
  // row below so it's obvious at a glance which areas need attention.
  const urgentCats = useMemo(
    () => new Set(agenda.filter((i) => !i.done && i.date && i.date <= today).map((i) => i.category)),
    [agenda, today]
  );

  function onToggle(it: AgendaItem) {
    if (it.recurring && it.occurrence) toggleOccurrence(it.occurrence);
    else if (it.taskId) toggleComplete(it.taskId);
  }

  function onSetStatus(it: AgendaItem, status: Status) {
    setStatus(
      it.taskId
        ? { taskId: it.taskId }
        : { recurrenceId: it.occurrence?.recurrenceId, date: it.occurrence?.date },
      status
    );
  }

  function onEdit(it: AgendaItem) {
    let task: Task | undefined;
    if (it.taskId) task = tasks.find((t) => t.id === it.taskId);
    else if (it.occurrence) task = materialize(it.occurrence.recurrenceId, it.occurrence.date);
    if (task) {
      setEditItem(task);
      setSheetOpen(true);
    }
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">{agenda.length} tasks · sorted by due date</div>
        <h1 className="screen-head__title">
          Every task, organized
          <HelpTip text="Your to-dos in one place: one-off and recurring, prioritized, assignable to people, and filterable by status or category." />
        </h1>
      </div>

      <div style={{ marginTop: 14 }} data-tour="tasks-segmented">
        <Segmented options={SEGS} value={seg} onChange={setSeg} />
      </div>

      <div style={{ marginTop: 12 }}>
        <ChipRow>
          <Chip active={!catFilter} onClick={() => setCatFilter("")}>All</Chip>
          {categories.map((c) => (
            <Chip key={c} active={catFilter === c} dotColor={categoryColor(c)} urgent={urgentCats.has(c)}
              onClick={() => setCatFilter(catFilter === c ? "" : c)}>
              {c}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {/* Filter & sort controls */}
      <div className="filterbar" data-tour="tasks-filters">
        <select className="input input--sm" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "")}>
          <option value="">All statuses</option>
          {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
        </select>
        <select className="input input--sm" aria-label="Filter by priority" value={priFilter} onChange={(e) => setPriFilter(e.target.value as Priority | "")}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p.replace(/([A-Z])/g, " $1").trim()}</option>)}
        </select>
        {assignees.length > 0 && (
          <select className="input input--sm" aria-label="Filter by assignee" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">Anyone</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <select className="input input--sm" aria-label="Sort tasks by" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
        <label className="filterbar__toggle">
          <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
          Include completed
        </label>
      </div>

      {seg === "overdue" && counts.overdue > 0 && (
        <p className="muted" style={{ margin: "10px 2px", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconHeart size={15} style={{ color: "var(--accent)" }} />
          {counts.overdue} task{counts.overdue > 1 ? "s" : ""} need your love
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <EmptyState
            icon={seg === "overdue" ? <IconHeart size={28} /> : <IconTasks size={28} />}
            title={seg === "overdue" ? "Nothing overdue" : "All clear here"}
            sub={seg === "today" ? "Nothing due today. Add something or enjoy the calm." : "Tap + to add a task or routine."}
          />
        </div>
      ) : (
        // A real data table, not a single-column row list — category,
        // priority, status, assignee, due date, and days-left are all
        // visible at once instead of stacked into one row's subtext.
        // Reported directly, 2026-07-21: match the reference mockup's
        // information density. The column set needs real width to stay
        // legible (~900px), which won't fit a phone or a narrower desktop
        // window — .tasks-table-scroll handles that with horizontal scroll
        // instead of squishing columns unreadably, per the same request.
        <div className="card tasks-table-card" style={{ marginTop: 14 }}>
          <div className="tasks-table-scroll">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }} aria-label="Done" />
                  <SortTh label="Task" value="name" sort={sort} onSort={setSort} />
                  <SortTh label="Category" value="category" sort={sort} onSort={setSort} />
                  <SortTh label="Priority" value="priority" sort={sort} onSort={setSort} />
                  <SortTh label="Status" value="status" sort={sort} onSort={setSort} />
                  <SortTh label="Assigned" value="assignee" sort={sort} onSort={setSort} />
                  <SortTh label="Due" value="due" sort={sort} onSort={setSort} />
                  <SortTh label="Days left" value="daysleft" sort={sort} onSort={setSort} />
                  <th style={{ width: 70 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => (
                  <TaskRow key={it.key} item={it} today={today}
                    onToggle={() => onToggle(it)} onEdit={() => onEdit(it)}
                    onSetStatus={(st) => onSetStatus(it, st)}
                    onDelete={it.taskId ? () => deleteTask(it.taskId!) : undefined} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {remaining > 0 && (
        <button
          className="btn btn--ghost btn--stack"
          style={{ marginTop: 10 }}
          onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
        >
          View more ({remaining} left)
        </button>
      )}

      <TipBanner />

      <button className="fab" aria-label="Add task" data-tour="tasks-fab" onClick={() => { setEditItem(null); setSheetOpen(true); }}>
        <IconPlus />
      </button>

      <TaskSheet open={sheetOpen} editTask={editItem}
        onClose={() => { setSheetOpen(false); setEditItem(null); }} />
    </>
  );
}

function SortTh({
  label, value, sort, onSort,
}: {
  label: string;
  value: Sort;
  sort: Sort;
  onSort: (v: Sort) => void;
}) {
  const on = sort === value;
  return (
    <th>
      <button
        className={`tasks-table__sortbtn${on ? " tasks-table__sortbtn--on" : ""}`}
        onClick={() => onSort(value)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {on && <IconChevron size={11} className="tasks-table__sorticon" />}
      </button>
    </th>
  );
}

function TaskRow({
  item, today, onToggle, onEdit, onSetStatus, onDelete,
}: {
  item: AgendaItem;
  today: string;
  onToggle: () => void;
  onEdit: () => void;
  onSetStatus: (s: Status) => void;
  onDelete?: () => void;
}) {
  const overdue = item.date && item.date < today && !item.done;
  const d = item.date ? daysBetween(today, item.date) : null;

  return (
    <tr className={`tasks-table__row${item.done ? " tasks-table__row--done" : ""}${overdue ? " tasks-table__row--overdue" : ""}`}>
      <td>
        <Checkbox checked={item.done} onChange={onToggle} label={item.title} />
      </td>
      <td className="tasks-table__task">
        <button className="tasks-table__taskbtn" onClick={onEdit}>
          <div className="row__title row__title--inline">
            {item.recurring && <IconRepeat size={13} className="ic-muted" />}
            <span className="row__title-txt">{item.title}</span>
          </div>
          {item.notes && <div className="tasks-table__notes">{item.notes}</div>}
        </button>
      </td>
      <td>
        <span className="chip" style={{ padding: "3px 10px", fontSize: 11.5, background: categoryPillBg(item.category), color: categoryPillInk(item.category) }}>
          {item.category}
        </span>
      </td>
      <td>
        <span className="tasks-table__prio">
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLOR[item.priority], flex: "none" }} />
          {PRIORITY_LABEL[item.priority]}
        </span>
      </td>
      <td>
        <select
          className="status-sel"
          aria-label="Status"
          value={item.status}
          onChange={(e) => onSetStatus(e.target.value as Status)}
          style={{ color: STATUS_COLOR[item.status], background: STATUS_PILL_BG[item.status] }}
        >
          {STATUSES.map((st) => <option key={st} value={st} style={{ color: "var(--ink)" }}>{STATUS_LABEL[st]}</option>)}
        </select>
      </td>
      <td>
        {item.assignee ? (
          <span className="inline-avatar-wrap">
            <span className="avatar avatar--xs" style={{ background: stringColor(item.assignee) }}>
              {initials(item.assignee)}
            </span>
            {item.assignee}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td style={{ color: overdue ? "var(--alert)" : undefined, fontWeight: overdue ? 700 : undefined }}>
        {item.date ? dueLabel(item.date, today) : "No date"}
      </td>
      <td>
        {/* "Due" already spells out Today/Tomorrow/In Nd — this column is
            just the same value as a plain signed number, so 0 renders as
            "0d" like every other row instead of a redundant duplicate
            "today" (reported directly, 2026-07-21: "due today, and days
            left today???"). */}
        {d !== null && (
          <span className="days-badge" title="Days left" style={{ color: d < 0 ? "var(--alert)" : d === 0 ? "var(--warn)" : "var(--muted)" }}>
            {d}d
          </span>
        )}
      </td>
      <td>
        <div className="tasks-table__actions">
          <button className="muted" onClick={onEdit} aria-label={`Edit ${item.title}`}>
            <IconEdit size={15} />
          </button>
          {onDelete && (
            <button className="muted" onClick={onDelete} aria-label={`Delete ${item.title}`}>
              <IconTrash size={15} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
