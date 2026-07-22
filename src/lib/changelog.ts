// Release notes shown on the What's New screen (Tesla-style: quiet, pull-based,
// no badges or popups — users visit it from Settings when they're curious).
//
// HOW TO ADD A RELEASE: prepend a new entry to the TOP of this list whenever
// you deploy something user-visible. Keep items short, benefit-first, and in
// plain language (no internal jargon). Newest first.

export interface Release {
  version: string;
  date: string; // ISO yyyy-mm-dd
  title: string; // one-line theme for the release
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "1.1.0",
    date: "2026-07-12",
    title: "A friendlier tour, roomier calendar, and quality-of-life fixes",
    items: [
      "The coach tour box can now be moved: drag the little handle at the top.",
      "You can now go Back in the tour, not just forward.",
      "The tour now includes a Sample data / My data switch so you can explore with examples even before adding anything of your own.",
      "Calendar day boxes are bigger and easier to read and tap.",
      "New app icon, and a clear Demo badge whenever you're viewing sample data.",
      "The Connect button now clearly shows when it's locked until you enter your code.",
      "Fixed text overlapping on the dashboard on mid-size screens.",
      "Scrollbars now match the app's theme in light and dark.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-06",
    title: "Hello, world",
    items: [
      "First release: tasks, recurring routines, calendar, habits, goals, time blocking, budget, savings, debt payoff, meals, grocery, fitness, weight, and hydration, all in one planner.",
      "Optional sync to a spreadsheet in your own Google Drive: your data stays yours.",
      "Works offline, on any device, straight from the browser.",
    ],
  },
];
