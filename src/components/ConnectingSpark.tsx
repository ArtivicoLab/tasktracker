// A waiting-for-Google moment for Spark (the same character as Mascot.tsx),
// instead of a generic spinner — same face-drawing DNA (accent circle,
// outline stroke, cheek blushes) so it reads as "the app's character is
// waiting with you," not an unrelated loading widget bolted on. The ring
// spinning around it uses the same conic-gradient technique as ProgressRing
// (hand-rolled, no animation library, matching this repo's existing rule).
export function ConnectingSpark({ text }: { text: string }) {
  return (
    <div className="connect-spark">
      <span className="connect-spark__halo" aria-hidden>
        <svg className="connect-spark__face" width="34" height="34" viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="17" fill="var(--accent)" stroke="var(--outline)" strokeWidth="2.5" />
          <circle cx="11.5" cy="22.5" r="2.2" fill="var(--cat-pink)" opacity="0.7" />
          <circle cx="28.5" cy="22.5" r="2.2" fill="var(--cat-pink)" opacity="0.7" />
          <circle className="connect-spark__eye" cx="14" cy="18" r="1.8" fill="var(--outline)" />
          <circle className="connect-spark__eye" cx="26" cy="18" r="1.8" fill="var(--outline)" />
          <circle cx="20" cy="26" r="2" fill="none" stroke="var(--outline)" strokeWidth="1.6" />
        </svg>
      </span>
      <span className="connect-spark__line">{text}</span>
    </div>
  );
}
