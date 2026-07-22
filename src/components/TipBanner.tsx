// Rotating ADHD tip banner — one line of practical, gentle guidance, changed
// daily (keyed off day-of-month, same idiom as DashboardScreen's hero line)
// so both Dashboard and Tasks show the SAME tip on a given day.
import { IconZap } from "./icons";

const TIPS: string[] = [
  "Review overdue tasks first — tackle what matters most.",
  "Pick the smallest task on your list and start there. Momentum beats motivation.",
  "Feeling stuck? Just do one thing. Any one thing.",
  "Recurring tasks build momentum — check one off to keep the streak alive.",
  "A task feeling heavy? Break it into two smaller ones.",
  "Done is better than perfect. Check it off and move on.",
  "Pick ONE priority for today — everything else can wait.",
  "A long list is loud. Filter down to just Today and breathe.",
];

export function TipBanner() {
  const tip = TIPS[new Date().getDate() % TIPS.length];
  return (
    <div
      className="card pop-grape sticker-rot-b"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        marginTop: 14, background: "var(--cat-lavender-soft)",
      }}
    >
      <span style={{
        width: 30, height: 30, borderRadius: "50%", flex: "none",
        display: "grid", placeItems: "center",
        background: "var(--surface)", border: "2px solid var(--outline)",
        color: "var(--cat-lavender-deep)",
      }}>
        <IconZap size={15} />
      </span>
      <span style={{ fontSize: 14, color: "var(--ink)" }}>
        <strong>ADHD tip:</strong> {tip}
      </span>
    </div>
  );
}
