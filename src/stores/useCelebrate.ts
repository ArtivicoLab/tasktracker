import { create } from "zustand";

interface CelebrateState {
  burstId: number;
  fire: () => void;
}

let nextId = 1;

/** Fired once per task marked Completed via checkbox (see useTasks.ts's
 * toggleComplete/toggleOccurrence) — Celebration.tsx renders the actual
 * confetti/glow/sound in response. A bare incrementing id, not a boolean,
 * so two completions in quick succession each get their own burst instead
 * of the second one being a no-op because "celebrating" was already true. */
export const useCelebrate = create<CelebrateState>((set) => ({
  burstId: 0,
  fire: () => set({ burstId: nextId++ }),
}));
