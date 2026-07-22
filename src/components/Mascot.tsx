// Spark — the app's one character. A face is the cheapest reliable way to
// give software a personality; keep the copy warm and specific, never a
// generic nag. Reuses the same due-today count the nav badges already show
// (useDueToday, lib/dueToday.ts) — no new data wiring.
function faceFor(remaining: number): { line: string; mood: "grin" | "smile" | "calm" } {
  if (remaining === 0) {
    return { line: "All clear today. Nice work.", mood: "grin" };
  }
  if (remaining <= 2) {
    return { line: `Almost there — ${remaining} to go.`, mood: "smile" };
  }
  return { line: `${remaining} need you today. You've got this.`, mood: "calm" };
}

export function Mascot({ dueToday }: { dueToday: number }) {
  const { line, mood } = faceFor(dueToday);
  const mouth =
    mood === "grin" ? "M15 25q5 5 10 0" : mood === "smile" ? "M16 25q4 3 8 0" : "M16 26h8";

  return (
    <div className="mascot pop-pink sticker-rot-b">
      <svg className="mascot__face" width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="17" fill="var(--accent)" stroke="var(--outline)" strokeWidth="2.5" />
        <circle cx="14" cy="18" r="1.8" fill="var(--outline)" />
        <circle cx="26" cy="18" r="1.8" fill="var(--outline)" />
        <circle cx="11.5" cy="22.5" r="2.2" fill="var(--cat-pink)" opacity="0.7" />
        <circle cx="28.5" cy="22.5" r="2.2" fill="var(--cat-pink)" opacity="0.7" />
        <path d={mouth} stroke="var(--outline)" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <span className="mascot__line">{line}</span>
    </div>
  );
}
