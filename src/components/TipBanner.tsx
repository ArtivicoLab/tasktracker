// Rotating ADHD tip banner — one line of practical, gentle guidance, changed
// daily (keyed off day-of-month, same idiom as DashboardScreen's hero line)
// so both Dashboard and Tasks show the SAME tip on a given day.
import { IconZap } from "./icons";

const TIPS: string[] = [
  "Review overdue tasks first. Tackle what matters most.",
  "Pick the smallest task on your list and start there. Momentum beats motivation.",
  "Feeling stuck? Just do one thing. Any one thing.",
  "Recurring tasks build momentum. Check one off to keep the streak alive.",
  "A task feeling heavy? Break it into two smaller ones.",
  "Done is better than perfect. Check it off and move on.",
  "Pick ONE priority for today. Everything else can wait.",
  "A long list is loud. Filter down to just Today and breathe.",
];

export function TipBanner({ inline }: { inline?: boolean }) {
  const tip = TIPS[new Date().getDate() % TIPS.length];

  // Dropped inside another card (Dashboard's activity timeline) instead of
  // standing alone as its own full-width sticker — a plain, borderless row
  // so it reads as that card's closing line, not a second competing card.
  if (inline) {
    return (
      <div className="tip-inline">
        <span className="tip-inline__icon">
          <IconZap size={13} />
        </span>
        <span className="tip-inline__text">
          <strong>ADHD tip:</strong> {tip}
        </span>
      </div>
    );
  }

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
