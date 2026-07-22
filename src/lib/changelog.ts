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
    version: "1.0.0",
    date: "2026-07-21",
    title: "Hello, world",
    items: [
      "First release: tasks, recurring routines, and a Weekly/Monthly calendar, all in one tracker.",
      "Assign tasks to people on your team, and see who's covering what at a glance.",
      "A Smart Task Center dashboard: KPIs, status/category/priority breakdowns, and an activity timeline.",
      "Optional sync to a spreadsheet in your own Google Drive: your data stays yours.",
      "Works offline, on any device, straight from the browser.",
    ],
  },
];
