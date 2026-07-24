// Lightweight charts built with CSS/JS only (no SVG, no chart library).
// Donut = conic-gradient; bars = flex divs. Enough for the dashboard breakdowns.
import { initials } from "../lib/ui";

interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  size = 120,
  thickness = 18,
  center,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
}) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  let acc = 0;
  const stops = slices
    .map((s) => {
      const start = (acc / total) * 360;
      acc += Math.max(0, s.value);
      const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  const summary = slices
    .map((s) => `${s.label} ${Math.round((Math.max(0, s.value) / total) * 100)}%`)
    .join(", ");

  return (
    <div className="chart-donut">
      <div
        className="chart-donut__ring"
        role="img"
        aria-label={summary || "No data"}
        style={{
          width: size,
          height: size,
          background: total > 0 ? `conic-gradient(${stops})` : "var(--surface-2)",
        }}
      >
        <div className="chart-donut__hole" style={{ inset: thickness }}>
          {center}
        </div>
      </div>
      <div className="chart-donut__legend">
        {slices.map((s) => (
          <div key={s.label} className="spread fs-13">
            {/* The percentage is the actual data point — bold, full ink.
                The label is context for it, so it's the secondary/muted
                one. Was the other way around (label plain, % muted), which
                buried the number the row exists to show. */}
            <span className="chart-donut__slice-label muted">
              <span className="chart-donut__swatch" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="chart-donut__slice-pct">{Math.round((Math.max(0, s.value) / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A ranked list of mini progress bars — dot, fixed-width label, a thin
 * proportional track, and the percentage. Built for data like task Status,
 * where one or two segments (Completed, Not Started) dominate and the rest
 * round to 0-1%: a donut just shows unreadable slivers for those, while a
 * list states the exact number next to a bar that's honestly almost empty.
 * Keeps the caller's own ordering (e.g. STATUSES' fixed order) rather than
 * re-sorting by value, so row order doesn't jump around as data changes.
 */
export function RankedBars({ items }: { items: Slice[] }) {
  const total = items.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  return (
    <div className="chart-rankedbars">
      {items.map((s) => {
        const p = Math.max(0, s.value) / total;
        return (
          <div key={s.label} className="chart-rankedbars__row">
            <span className="chart-rankedbars__dot" style={{ background: s.color }} />
            <span className="chart-rankedbars__label">{s.label}</span>
            <span
              className="chart-rankedbars__track"
              role="img"
              aria-label={`${s.label}: ${Math.round(p * 100)}%`}
            >
              <span className="chart-rankedbars__fill" style={{ width: `${p * 100}%`, background: s.color }} />
            </span>
            <span className="chart-rankedbars__pct">{Math.round(p * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A single rounded track split into proportional colored segments, with a legend
 * of count chips below. Honest at any shape: one status → one full bar. Replaces
 * a single-value "donut" that isn't really a chart.
 */
export function StatusBar({ segments }: { segments: Slice[] }) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((a, s) => a + s.value, 0) || 1;
  const summary = shown.map((s) => `${s.label} ${s.value}`).join(", ");
  return (
    <div>
      <div className="chart-statusbar__track" role="img" aria-label={summary || "No data"}>
        {shown.map((s) => (
          <div key={s.label} title={`${s.label}: ${s.value}`} style={{ flex: s.value, background: s.color }} />
        ))}
      </div>
      <div className="chart-statusbar__legend">
        {shown.map((s) => (
          <span key={s.label} className="chart-legend-item">
            <span className="dot-9" style={{ background: s.color }} />
            {s.label}
            <span className="muted txt-strong">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Vertical column trend (daily % completion, etc). CSS
 * columns, JS-normalized. Pass `min`/`max` for a fixed domain (e.g. 0–100 for
 * percentages) — omit them to auto-scale to the data's own range (e.g. counts).
 * Auto-scaling means a bar's HEIGHT is only ever relative to the busiest point
 * in `points`, not an absolute count — a single logged item on an otherwise
 * empty week renders as a "full" bar exactly like 10 items would. That's
 * invisible on hover (the title/aria-label tooltip) but easy to misread at a
 * glance on mobile, where nothing hovers (confirmed 2026-07-14: "i dont
 * undersatand what the full bar means"). Pass `showValues` to print the exact
 * number above each non-zero bar so "full" never has to be interpreted.
 */
export function Columns({
  points,
  height = 120,
  color = "var(--accent)",
  min,
  max,
  showValues,
}: {
  points: { label: string; value: number }[];
  height?: number;
  color?: string;
  min?: number;
  max?: number;
  showValues?: boolean;
}) {
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  const lo = min ?? Math.min(...vals);
  const hi = max ?? Math.max(...vals);
  const span = hi - lo || 1;
  return (
    <div className="chart-columns" style={{ height }}>
      {points.map((p, i) => {
        const h = 18 + ((p.value - lo) / span) * (height - 30);
        return (
          <div key={i} className="chart-column">
            <div
              title={`${p.label}: ${p.value}`}
              role="img"
              aria-label={`${p.label}: ${p.value}`}
              className="chart-column__bar"
              style={{
                height: Math.max(2, h),
                background: color,
                opacity: 0.55 + 0.45 * ((p.value - lo) / span),
              }}
            >
              {showValues && p.value > 0 && (
                <span className="chart-column__value">{p.value}</span>
              )}
            </div>
            {points.length <= 8 && (
              <span className="muted chart-column__label">{p.label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface StackedPoint {
  label: string;
  a: number; // bottom segment (e.g. completed)
  b: number; // top segment (e.g. pending)
}

/** Two-color stacked columns — an "activity timeline" of two totals per slot. */
export function StackedColumns({
  points,
  height = 120,
  colorA = "var(--success)",
  colorB = "var(--surface-2)",
  labelA = "Completed",
  labelB = "Pending",
}: {
  points: StackedPoint[];
  height?: number;
  colorA?: string;
  colorB?: string;
  labelA?: string;
  labelB?: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.a + p.b));
  return (
    <div>
      <div className="chart-stackedcolumns__legend">
        <span className="chart-legend-item">
          <span className="dot-9" style={{ background: colorA }} />
          <span className="muted">{labelA}</span>
        </span>
        <span className="chart-legend-item">
          <span className="dot-9" style={{ background: colorB }} />
          <span className="muted">{labelB}</span>
        </span>
      </div>
      <div className="chart-columns" style={{ height }}>
        {points.map((p, i) => {
          const total = p.a + p.b;
          const totalH = total > 0 ? Math.max(4, (total / max) * (height - 20)) : 2;
          const aH = total > 0 ? (p.a / total) * totalH : 0;
          const bH = totalH - aH;
          return (
            <div key={i} className="chart-column">
              <div
                title={`${p.label}: ${p.a} ${labelA.toLowerCase()}, ${p.b} ${labelB.toLowerCase()}`}
                role="img"
                aria-label={`${p.label}: ${p.a} ${labelA.toLowerCase()}, ${p.b} ${labelB.toLowerCase()}`}
                className="chart-stackedcolumns__bar"
                style={{ height: totalH }}
              >
                <div className="chart-stackedcolumns__seg" style={{ height: aH, background: colorA }} />
                <div className="chart-stackedcolumns__seg" style={{ height: bH, background: colorB }} />
              </div>
              {points.length <= 14 && (
                <span className="muted chart-column__label">{p.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface SegmentedBarRow {
  label: string;
  total: number;
  segments: { value: number; color: string }[];
}

/**
 * A ranked breakdown where each row itself has an internal mix — e.g.
 * "priority split, per category": fixed-width right-aligned label, a
 * bordered pill track split into proportional colored segments, the row's
 * total on the right in the display face. One line per row (label, bar,
 * and count all inline) rather than stacking the label above a full-width
 * bar — reads as a compact ranked list even with several rows in a
 * card-width column.
 */
export function SegmentedBars({ rows, labelWidth = 64 }: { rows: SegmentedBarRow[]; labelWidth?: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="chart-segbars">
      {rows.map((r) => {
        const shown = r.segments.filter((s) => s.value > 0);
        return (
          <div key={r.label} className="chart-segbars__row">
            <span className="chart-segbars__label" style={{ width: labelWidth, flex: `0 0 ${labelWidth}px` }}>
              {r.label}
            </span>
            <span className="chart-segbars__track" role="img" aria-label={`${r.label}: ${r.total}`}>
              {shown.map((s, i) => (
                <span key={i} className="chart-segbars__seg" style={{ flex: s.value, background: s.color }} />
              ))}
            </span>
            <span className="chart-segbars__count">{r.total}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface PersonPoint {
  label: string;
  value: number;
  color: string;
}

/**
 * Horizontal ranked bars — avatar, name, a proportional track, the count.
 * Replaces a vertical column chart for "count per person": a column chart
 * scales bar HEIGHT to the busiest person, which makes one person who owns
 * most tasks (very common — "Me" usually dominates) render everyone else as
 * a sliver a couple pixels tall. A horizontal track has much more room to
 * stay legible at the low end, and reads like a leaderboard.
 */
export function PeopleBars({ points }: { points: PersonPoint[] }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="chart-peoplebars">
      {points.map((p) => (
        <div key={p.label} className="chart-peoplebars__row">
          <span className="avatar avatar--sm chart-peoplebars__avatar" style={{ background: p.color }}>
            {initials(p.label)}
          </span>
          <span className="chart-peoplebars__label">{p.label}</span>
          <span
            className="chart-peoplebars__track"
            role="img"
            aria-label={`${p.label}: ${p.value}`}
          >
            <span className="chart-peoplebars__fill" style={{ width: `${(p.value / max) * 100}%`, background: p.color }} />
          </span>
          <span className="chart-peoplebars__value">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
