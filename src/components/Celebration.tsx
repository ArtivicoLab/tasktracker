// Confetti + a soft glow pulse + a short chime, fired once per task checked
// off (see useCelebrate.ts / useTasks.ts). Everything here is hand-rolled
// CSS/JS — no confetti library, no bundled audio file, matching this repo's
// existing "no chart/animation library" rule (see Charts.tsx, ProgressRing.tsx).
// Deliberately NOT a strobe/flashing effect — rapid full-screen flashing is a
// real photosensitive-seizure risk (WCAG 2.3.1); this is one brief, soft pulse.
import { useEffect, useRef, useState } from "react";
import { useCelebrate } from "../stores/useCelebrate";
import { useSettings } from "../stores/useSettings";

const COLORS = [
  "var(--cat-pink)", "var(--cat-teal)", "var(--cat-sky)", "var(--cat-butter)",
  "var(--cat-lavender)", "var(--cat-mint)", "var(--cat-gold)", "var(--cat-rose)",
];
const PIECE_COUNT = 26;
const FALL_MS = 1000;

interface Piece {
  id: number;
  leftPct: number;
  color: string;
  delayMs: number;
  rotDeg: number;
  driftPx: number;
}

function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    // A quick major-triad arpeggio (C5-E5-G5) — bright and short, not a harsh beep.
    const notes = [523.25, 659.25, 783.99];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.42);
    });
    // Let the context close itself once the notes finish; no need to keep it open.
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* Web Audio unavailable/blocked — the visual celebration still runs on its own. */
  }
}

export function Celebration() {
  const burstId = useCelebrate((s) => s.burstId);
  const celebrateSound = useSettings((s) => s.celebrateSound);
  const celebrateConfetti = useSettings((s) => s.celebrateConfetti);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [glowKey, setGlowKey] = useState(0);
  // Captured ONCE at mount (useRef's initializer is only ever used on the
  // very first render) — comparing against this, rather than a "have I run
  // yet" boolean latch, is what makes this StrictMode-safe. StrictMode
  // double-invokes effects once per mount in dev (setup → cleanup → setup
  // again) specifically to catch bugs like this: a boolean latch flips to
  // false on the FIRST of those two invocations and stays false for the
  // second one, which then wrongly reads as "not the initial run" and fires
  // for real — reproducing exactly as "confetti on every reload" (confirmed
  // 2026-07-22, dev-server only, since production React never double-invokes).
  // Comparing burstId to its own mount-time value is idempotent no matter
  // how many times the same value gets re-invoked.
  const mountBurstId = useRef(burstId);

  useEffect(() => {
    if (burstId === mountBurstId.current) return;
    if (celebrateSound) playChime();
    if (!celebrateConfetti) {
      setPieces([]);
      return;
    }
    setGlowKey((k) => k + 1);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPieces([]);
      return;
    }
    const next: Piece[] = Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: i,
      leftPct: Math.random() * 100,
      color: COLORS[i % COLORS.length],
      delayMs: Math.random() * 150,
      rotDeg: 180 + Math.random() * 540,
      driftPx: (Math.random() - 0.5) * 120,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), FALL_MS + 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstId]);

  return (
    <>
      {glowKey > 0 && <div key={glowKey} className="celebrate-glow" aria-hidden />}
      {pieces.length > 0 && (
        <div className="celebrate-confetti" aria-hidden>
          {pieces.map((p) => (
            <span
              key={p.id}
              className="celebrate-confetti__piece"
              style={{
                left: `${p.leftPct}%`,
                background: p.color,
                animationDelay: `${p.delayMs}ms`,
                ["--rot" as string]: `${p.rotDeg}deg`,
                ["--drift" as string]: `${p.driftPx}px`,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
