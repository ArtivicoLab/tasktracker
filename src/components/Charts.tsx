// Lightweight charts built with CSS/JS only (no SVG, no chart library).
// Donut = conic-gradient; bars = flex divs. Enough for the dashboard breakdowns.

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
            <span className="chart-donut__slice-label">
              <span className="chart-donut__swatch" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="muted">{Math.round((Math.max(0, s.value) / total) * 100)}%</span>
          </div>
        ))}
      </div>
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

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

/** Horizontal comparison bars (budget vs actual style). */
export function Bars({ data, max }: { data: BarDatum[]; max?: number }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart-bars">
      {data.map((d) => (
        <div key={d.label}>
          <div className="spread row-label-12">
            <span className="muted">{d.label}</span>
          </div>
          <div className="pbar" role="img" aria-label={`${d.label}: ${d.value}`}>
            <div
              className="pbar__fill"
              style={{
                width: `${Math.min(100, (d.value / top) * 100)}%`,
                background: d.color ?? "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface GroupedDatum {
  label: string;
  budget: number;
  actual: number;
}

/** Paired horizontal bars per category — "Budget vs Actual" style comparisons. */
export function GroupedBars({ data }: { data: GroupedDatum[] }) {
  const top = Math.max(1, ...data.flatMap((d) => [d.budget, d.actual]));
  return (
    <div className="chart-groupedbars">
      <div className="chart-groupedbars__legend">
        <span className="chart-legend-item">
          <span className="dot-9 dot-9--accent" />
          <span className="muted">Budget</span>
        </span>
        <span className="chart-legend-item">
          <span className="dot-9 dot-9--accent2" />
          <span className="muted">Actual</span>
        </span>
      </div>
      {data.map((d) => (
        <div key={d.label}>
          <div className="chart-groupedbars__label">{d.label}</div>
          <div className="pbar mb-1" role="img" aria-label={`${d.label} budget: ${d.budget}`}>
            <div className="pbar__fill pbar__fill--budget" style={{ width: `${Math.min(100, (d.budget / top) * 100)}%` }} />
          </div>
          <div className="pbar" role="img" aria-label={`${d.label} actual: ${d.actual}`}>
            <div className="pbar__fill pbar__fill--actual" style={{ width: `${Math.min(100, (d.actual / top) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Vertical column trend (weight over time, daily % completion, etc). CSS
 * columns, JS-normalized. Pass `min`/`max` for a fixed domain (e.g. 0–100 for
 * percentages) — omit them to auto-scale to the data's own range (e.g. weight).
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
              {points.length <= 12 && (
                <span className="muted chart-column__label">{p.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
