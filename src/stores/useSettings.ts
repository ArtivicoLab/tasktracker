import { create } from "zustand";
import { getKV, setKV } from "../lib/db";
import { syncDailyDigest } from "../lib/reminders";
import { DEFAULT_CATEGORIES, type Settings } from "../lib/types";

const KEY = "settings";
const DEFAULTS: Settings = {
  name: "",
  weekStart: 0,
  theme: "auto",
  digestTime: "",
  digestEventId: "",
  categories: [...DEFAULT_CATEGORIES],
  categoryColors: {},
  hiddenRoutes: [],
  householdMembers: [],
  tabBarRoutes: ["dashboard", "tasks", "calendar", "recurring"],
  accessCode: "",
  activated: false,
  hideAtsHint: false,
  tourDone: false,
};

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

function applyTheme(theme: Settings["theme"]) {
  document.documentElement.setAttribute("data-theme", theme);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    const stored = (await getKV<Settings>(KEY)) ?? {};
    const merged = { ...DEFAULTS, ...stored };
    applyTheme(merged.theme);
    set({ ...merged, loaded: true });
  },
  update: (patch) => {
    const prev = pickSettings(get());
    const next = { ...prev, ...patch };
    if (patch.theme) applyTheme(patch.theme);
    set(patch);
    void setKV(KEY, next);
    // Only the actual settings screen calls this with a changed digestTime —
    // never on boot's `load()` — so the calendar.events scope stays lazy:
    // this is the first (and only) place it can be requested interactively.
    if (patch.digestTime !== undefined && patch.digestTime !== prev.digestTime) {
      void syncDailyDigest(patch.digestTime, prev.digestEventId).then((eventId) => {
        if (eventId === undefined || eventId === get().digestEventId) return;
        // Persist directly, bypassing `update()`, so this never re-triggers digest sync.
        set({ digestEventId: eventId });
        void setKV(KEY, { ...pickSettings(get()), digestEventId: eventId });
      });
    }
  },
}));

function pickSettings(s: Settings): Settings {
  return {
    name: s.name,
    weekStart: s.weekStart,
    theme: s.theme,
    digestTime: s.digestTime,
    digestEventId: s.digestEventId,
    categories: s.categories,
    categoryColors: s.categoryColors,
    hiddenRoutes: s.hiddenRoutes,
    householdMembers: s.householdMembers,
    tabBarRoutes: s.tabBarRoutes,
    accessCode: s.accessCode,
    activated: s.activated,
    hideAtsHint: s.hideAtsHint,
    tourDone: s.tourDone,
  };
}
