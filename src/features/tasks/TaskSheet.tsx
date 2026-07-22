// Add / edit sheet used by Tasks, Dashboard and Calendar.
// Handles one-time tasks AND recurrence creation, plus per-occurrence overrides.
import { useMemo, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { useTasks } from "../../stores/useTasks";
import { useSettings } from "../../stores/useSettings";
import { addDaysISO, todayISO } from "../../lib/dates";
import { categoryColor, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL } from "../../lib/ui";
import {
  PRIORITIES,
  STATUSES,
  type Frequency,
  type Priority,
  type Status,
  type Task,
} from "../../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editTask?: Task | null;
  defaultDate?: string;
}

type Repeat =
  | "none"
  | "daily"
  | "weekly"
  | "biweekly"
  | "every_n_weeks"
  | "monthly"
  | "every_n_months"
  | "yearly";

const REPEATS: { value: Repeat; label: string }[] = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "every_n_weeks", label: "Every N wks" },
  { value: "monthly", label: "Monthly" },
  { value: "every_n_months", label: "Every N mos" },
  { value: "yearly", label: "Yearly" },
];

export function TaskSheet({ open, onClose, editTask, defaultDate }: Props) {
  const { addTask, updateTask, addRecurrence, recurrences } = useTasks();
  const { categories, householdMembers } = useSettings();
  const editing = !!editTask;

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("Home");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [status, setStatus] = useState<Status>("NotStarted");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate ?? "");
  const [remind, setRemind] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [everyN, setEveryN] = useState(3);

  // Reset form each open.
  useMemo(() => {
    if (!open) return;
    if (editTask) {
      setTitle(editTask.title);
      setNotes(editTask.notes);
      setCategory(editTask.category);
      setPriority(editTask.priority);
      setStatus(editTask.status);
      setAssignee(editTask.assignee);
      setDueDate(editTask.dueDate);
      setRemind(editTask.remind);
      setRepeat("none"); // default to not-recurring; picking one here converts this task into a series (see save())
    } else {
      setTitle("");
      setNotes("");
      setCategory("Home");
      setPriority("Medium");
      setStatus("NotStarted");
      setAssignee("");
      setDueDate(defaultDate ?? "");
      setRemind(false);
      setRepeat("none");
      setEveryN(3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isRecurringOccurrence = editing && !!editTask?.recurrenceId;
  const seriesTitle = isRecurringOccurrence
    ? recurrences.find((r) => r.id === editTask?.recurrenceId)?.title
    : undefined;

  function toFrequency(): Frequency {
    if (repeat === "every_n_weeks") return `every_n_weeks:${everyN}` as Frequency;
    if (repeat === "every_n_months") return `every_n_months:${everyN}` as Frequency;
    return repeat as Frequency;
  }

  function save() {
    const t = title.trim();
    if (!t) return;
    const owner = assignee.trim();
    const completedAt = status === "Completed" ? (editTask?.completedAt || todayISO()) : "";
    if (editing && editTask && !isRecurringOccurrence && repeat !== "none") {
      // Turning a plain task into a recurring series: create the Recurrence
      // template anchored at its due date, then link THIS task to it as the
      // series' first occurrence — keeps its id/reminders/calendar event
      // instead of deleting and recreating it.
      const anchorDate = dueDate || todayISO();
      const rec = addRecurrence({
        title: t, notes, category, priority, assignee: owner, remind,
        frequency: toFrequency(), anchorDate,
      });
      updateTask(editTask.id, {
        title: t, notes, category, priority, status, completedAt, assignee: owner, dueDate: anchorDate, remind,
        recurrenceId: rec.id, occurrenceDate: anchorDate,
      });
    } else if (editing && editTask) {
      updateTask(editTask.id, {
        title: t, notes, category, priority, status, completedAt, assignee: owner, remind,
        dueDate: isRecurringOccurrence ? editTask.occurrenceDate : dueDate,
      });
    } else if (repeat === "none") {
      addTask({ title: t, notes, category, priority, status, completedAt, assignee: owner, dueDate, remind });
    } else {
      addRecurrence({
        title: t,
        notes,
        category,
        priority,
        assignee: owner,
        remind,
        frequency: toFrequency(),
        anchorDate: dueDate || todayISO(),
      });
    }
    onClose();
  }

  const quick: { label: string; iso: string }[] = [
    { label: "Today", iso: todayISO() },
    { label: "Tomorrow", iso: addDaysISO(todayISO(), 1) },
    { label: "Next week", iso: addDaysISO(todayISO(), 7) },
  ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit task" : "New task"}
    >
      {isRecurringOccurrence && (
        <div
          className="card"
          style={{ background: "var(--accent-soft)", marginBottom: 16, fontSize: 13 }}
        >
          Editing <b>this occurrence</b> of “{seriesTitle}”. Series repeats stay unchanged.
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="task-title">Title</label>
        <input
          id="task-title"
          className="input"
          autoFocus
          value={title}
          placeholder="What needs doing?"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="task-due-date">Due date</label>
        <ChipRow>
          {quick.map((q) => (
            <Chip key={q.label} active={dueDate === q.iso} onClick={() => setDueDate(q.iso)}>
              {q.label}
            </Chip>
          ))}
          <input
            id="task-due-date"
            type="date"
            className="input"
            style={{ width: "auto", padding: "7px 12px" }}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </ChipRow>
      </div>

      <div className="field">
        <label className="field__label">Category</label>
        <ChipRow>
          {categories.map((c) => (
            <Chip
              key={c}
              active={category === c}
              dotColor={categoryColor(c)}
              onClick={() => setCategory(c)}
            >
              {c}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="field">
        <label className="field__label">Priority</label>
        <ChipRow>
          {PRIORITIES.map((p) => (
            <Chip
              key={p}
              active={priority === p}
              dotColor={PRIORITY_COLOR[p]}
              onClick={() => setPriority(p)}
            >
              {PRIORITY_LABEL[p]}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {(editing || repeat === "none") && (
        <div className="field">
          <label className="field__label">Status</label>
          <ChipRow>
            {STATUSES.map((st) => (
              <Chip
                key={st}
                active={status === st}
                dotColor={STATUS_COLOR[st]}
                onClick={() => setStatus(st)}
              >
                {STATUS_LABEL[st]}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="task-assignee">Assigned to</label>
        {householdMembers.length > 0 && (
          <ChipRow>
            {householdMembers.map((m) => (
              <Chip key={m} active={assignee === m} onClick={() => setAssignee(m)}>{m}</Chip>
            ))}
          </ChipRow>
        )}
        <input
          id="task-assignee"
          className="input"
          value={assignee}
          placeholder="Task owner (optional)"
          onChange={(e) => setAssignee(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </div>

      {!isRecurringOccurrence && (
        <div className="field">
          <label className="field__label">Repeat</label>
          <ChipRow>
            {REPEATS.map((r) => (
              <Chip key={r.value} active={repeat === r.value} onClick={() => setRepeat(r.value)}>
                {r.label}
              </Chip>
            ))}
          </ChipRow>
          {repeat === "every_n_weeks" && (
            <div className="spread" style={{ marginTop: 10 }}>
              <span className="muted">Every</span>
              <input
                type="number"
                min={2}
                max={12}
                className="input"
                aria-label="Number of weeks"
                style={{ width: 70, textAlign: "center" }}
                value={everyN}
                onChange={(e) => setEveryN(Math.max(2, Number(e.target.value) || 2))}
              />
              <span className="muted">weeks, from {dueDate || todayISO()}</span>
            </div>
          )}
          {repeat === "every_n_months" && (
            <div className="spread" style={{ marginTop: 10 }}>
              <span className="muted">Every</span>
              <input
                type="number"
                min={2}
                max={12}
                className="input"
                aria-label="Number of months"
                style={{ width: 70, textAlign: "center" }}
                value={everyN}
                onChange={(e) => setEveryN(Math.max(2, Number(e.target.value) || 2))}
              />
              <span className="muted">months, from {dueDate || todayISO()}</span>
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label className="check-label spread" style={{ cursor: "pointer" }}>
          <span className="field__label" style={{ margin: 0 }}>
            Remind me
          </span>
          <button
            role="switch"
            aria-checked={remind}
            aria-label="Remind me"
            onClick={() => setRemind((v) => !v)}
            style={{
              width: 50,
              height: 30,
              borderRadius: 999,
              background: remind ? "var(--accent)" : "var(--surface-2)",
              position: "relative",
              transition: "background .2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: remind ? 23 : 3,
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                transition: "left .2s",
              }}
            />
          </button>
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Creates a Google Calendar event once your account is connected.
        </p>
      </div>

      <button className="btn btn--primary" onClick={save} disabled={!title.trim()}>
        {editing ? "Save changes" : repeat === "none" ? "Add task" : "Create routine"}
      </button>
    </BottomSheet>
  );
}
