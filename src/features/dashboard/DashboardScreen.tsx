import { useMemo, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { Checkbox } from "../../components/Checkbox";
import { HelpTip } from "../../components/HelpTip";
import { DueBadge } from "../../components/DueBadge";
import { useDueToday } from "../../lib/useDueToday";
import { TaskSheet } from "../tasks/TaskSheet";
import { TaskInsights } from "../tasks/TaskInsights";
import { buildAgenda, sortAgenda } from "../tasks/agenda";
import { useTasks } from "../../stores/useTasks";
import { useSettings } from "../../stores/useSettings";
import { addDaysISO, dueLabel, todayISO } from "../../lib/dates";
import { categoryColor, PRIORITY_COLOR } from "../../lib/ui";
import { navigate } from "../../router";
import { IconRepeat } from "../../components/icons";
import { DashboardHero } from "./DashboardHero";

export function DashboardScreen() {
  const { tasks, recurrences, toggleComplete, toggleOccurrence } = useTasks();
  const { categories } = useSettings();
  const [addOpen, setAddOpen] = useState(false);
  const today = todayISO();

  const agenda = useMemo(
    () => sortAgenda(buildAgenda(tasks, recurrences, addDaysISO(today, -90), addDaysISO(today, 60))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, recurrences]
  );

  const dueToday = agenda.filter((i) => i.date === today);
  const todayTotal = dueToday.length;
  const todayDone = dueToday.filter((i) => i.done).length;
  // Same "what's due today" total as the nav badge and browser-tab title
  // (see lib/dueToday.ts), so a Dashboard card and the nav pill never disagree.
  const dueCounts = useDueToday();
  const overdue = agenda.filter((i) => i.date && i.date < today && !i.done);
  const overdueShown = overdue.slice(0, 4);
  // agenda is sorted ascending by date, so this is simply the next few undone
  // items after today — not just literally "tomorrow".
  const upcoming = agenda.filter((i) => !i.done && i.date && i.date > today);
  const upcomingShown = upcoming.slice(0, 3);
  const nextUp = upcoming[0];

  // The hero talks like a person, not a status bar. One line per day-state,
  // rotated by day-of-month so it stays put all day but is fresh tomorrow.
  const heroContext = useMemo(() => {
    const pick = (lines: string[]) => lines[new Date().getDate() % lines.length];
    const left = todayTotal - todayDone;
    if (todayTotal > 0 && todayDone === todayTotal) {
      return pick([
        "All done. Take the victory lap.",
        "Clean sweep. Nothing left standing.",
        "List: cleared. You: unstoppable.",
      ]);
    }
    if (todayTotal === 0 && overdue.length > 0) {
      return "Nothing new today. A few stragglers below could use some love.";
    }
    if (todayTotal === 0) {
      return pick([
        "Nothing due. A blank-canvas kind of day.",
        "Clear skies today. Plan something fun.",
        "Nothing on the books. Breathe.",
      ]);
    }
    if (todayDone === 0) {
      return pick([
        `${todayTotal} on deck. Start anywhere, momentum does the rest.`,
        `${todayTotal} today. The first one is the hardest.`,
        `${todayTotal} lined up. Pick a small one and roll.`,
      ]);
    }
    return pick([
      `${todayDone} down, ${left} to go. Keep it rolling.`,
      `${todayDone} done already. The rest don't stand a chance.`,
      `${left} left. You've got the momentum.`,
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayTotal, todayDone, overdue.length]);

  return (
    <>
      <DashboardHero context={heroContext} />
      <TaskInsights items={agenda} today={today} categories={categories} />

      {/* Used to be wrapped in .bento, a multi-column layout for balancing
          MANY dashboard cards by height (Today/Schedule/Wellness/etc. in
          TrackerA). TrackerE only ever has this one card left here — with a
          single child, multi-column just squeezed it into one narrow ~50%
          (or ~33%) column instead of the full width every other dashboard
          card gets, reported directly as "looks weird and small"
          (2026-07-21). Unwrapped; see .card--today's own margin-top for the
          gap against TaskInsights' last card above it. */}
      <div className="card card--today" data-tour="today">
        <div className="spread spread--top dash-today__head">
          <div>
            <div className="section-title section-title--flush section-title--accent2">
              Today
              <HelpTip text="Everything due today across Tasks and Recurring, in one checklist." />
              <DueBadge count={dueCounts.tasks} />
            </div>
            <div className="muted muted-sub">
              {todayTotal === 0
                ? "Nothing due today. Enjoy the calm."
                : todayDone === 0
                ? `Fresh start: ${todayTotal} to go`
                : todayDone === todayTotal
                ? "All done today"
                : `${todayDone} of ${todayTotal} done`}
            </div>
          </div>
          {todayTotal > 0 &&
            (todayDone === 0 ? (
              <ProgressRing value={0} size={54} stroke={6} dotted
                ariaLabel={`${todayDone} of ${todayTotal} tasks done today`}
                center={<span className="dash-ring-label--empty">{todayDone}/{todayTotal}</span>} />
            ) : (
              <ProgressRing value={todayDone / todayTotal} size={54} stroke={6}
                ariaLabel={`${todayDone} of ${todayTotal} tasks done today`}
                center={<span className="dash-ring-label">{todayDone}/{todayTotal}</span>} />
            ))}
        </div>

        {dueToday.map((it) => (
          <div key={it.key} className={`row${it.done ? " row--done" : ""}`}>
            <Checkbox
              checked={it.done}
              onChange={() => {
                if (it.recurring && it.occurrence) toggleOccurrence(it.occurrence);
                else if (it.taskId) toggleComplete(it.taskId);
              }}
              label={it.title}
            />
            <div className="row__body">
              <div className="row__title row__title--inline">
                {it.recurring && <IconRepeat size={13} className="ic-muted" />}
                <span className="row__title-txt">{it.title}</span>
              </div>
              <div className="row__sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span className="dot-9 dot-9--round" style={{ background: categoryColor(it.category), flex: "none" }} />
                {it.category}{it.assignee ? ` · ${it.assignee}` : ""}
              </div>
            </div>
            <span className="priority-dot" style={{ background: PRIORITY_COLOR[it.priority] }} />
          </div>
        ))}

        {todayTotal === 0 && nextUp && (
          <div className="row dash-nextup">
            <div className="row__body">
              <div className="muted dash-eyebrow-11">NEXT UP</div>
              <div className="row__title row__title--inline dash-nextup__title">
                {nextUp.recurring && <IconRepeat size={13} className="ic-muted" />}
                <span className="row__title-txt">{nextUp.title}</span>
              </div>
            </div>
            <span className="dash-nextup__due">
              {dueLabel(nextUp.date)}
            </span>
          </div>
        )}

        {overdueShown.length > 0 && (
          <div className="dash-overdue">
            <span className="dash-overdue__label">
              {overdue.length} task{overdue.length > 1 ? "s" : ""} need{overdue.length > 1 ? "" : "s"} your love
            </span>
            {overdueShown.map((it) => (
              <div key={it.key} className="row">
                <Checkbox
                  checked={it.done}
                  onChange={() => {
                    if (it.recurring && it.occurrence) toggleOccurrence(it.occurrence);
                    else if (it.taskId) toggleComplete(it.taskId);
                  }}
                  label={it.title}
                />
                <div className="row__body">
                  <div className="row__title row__title--inline">
                    {it.recurring && <IconRepeat size={13} className="ic-muted" />}
                    <span className="row__title-txt">{it.title}</span>
                  </div>
                  <div className="row__sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="dot-9 dot-9--round" style={{ background: categoryColor(it.category), flex: "none" }} />
                    {it.category}
                  </div>
                </div>
                <span className="dash-duelabel--alert">
                  {dueLabel(it.date)}
                </span>
              </div>
            ))}
            {overdue.length > overdueShown.length && (
              <button className="muted dash-more-link"
                onClick={() => navigate("tasks", { seg: "overdue" })}>
                +{overdue.length - overdueShown.length} more →
              </button>
            )}
          </div>
        )}

        {upcomingShown.length > 0 && (
          <div className="dash-upcoming">
            <span className="muted eyebrow-12">UPCOMING</span>
            {upcomingShown.map((it) => (
              <div key={it.key} className="row dash-upcoming-row">
                <span className="dash-checkbox-spacer" />
                <div className="row__body">
                  <div className="row__title row__title--sm">{it.title}</div>
                </div>
                <span className="muted dash-upcoming__due">
                  {dueLabel(it.date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <TaskSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
