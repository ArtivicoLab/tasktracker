# Task Tracker

A static, dark-mode-first, phone-first PWA that replaces the "Task Tracker /
Smart Task Center" spreadsheet category. Built with Vite + React + TypeScript.
No backend of ours — everything works fully offline on IndexedDB, and
optionally syncs to a spreadsheet in your own Google Drive.

## Run

```bash
npm install
npm run dev        # http://localhost:5516
npm test           # recurrence + schema + reminders unit tests
npm run build      # static output in dist/
npx tsc --noEmit   # typecheck
```

## Status

**Built:**
- Design system — dark "Nightstamp" (default) + light "Postcard" themes, phone-first
  shell with a desktop sidebar (≥900px)
- Hash router, 4-screen bottom tab bar (Dashboard/Tasks/Calendar/Recurring), sync status pill
- IndexedDB persistence + sample data seeding (demo mode)
- Recurrence engine (lazy materialization) + Vitest tests
- Tasks (the "Smart Task Center"): KPI strip, alerts, live charts (status/category/priority
  donuts, priority-by-category bars, task activity timeline, person-in-charge chart),
  swipe-to-complete, filter/sort by status/priority/category/assignee
- **"Assigned to"** on every task/recurrence — free-text, with quick-pick chips from a
  user-managed Team members list (Settings) — no accounts or logins needed
- Recurring Task schedule screen — every series with its upcoming occurrences, per-occurrence
  edit, pause/resume, delete future/all
- Calendar: month/week/day views, quick-capture (type a task straight into any day),
  category/assignee/priority/status filters
- Google Sheets sync layer (`src/lib/sync.ts`, `src/lib/google/{auth,sheets,calendar}.ts`):
  connect/disconnect/relink/start-new-sheet, per-tab dirty tracking, retry-with-backoff,
  proactive token warm-up, an honest "Reconnect needed" badge — see this repo's `CLAUDE.md`
  for the sync architecture's design rules
- Etsy access-code gate with an escalating brute-force lockout (`src/lib/access.ts`)
- Onboarding coach tour (`src/components/CoachTour.tsx`), skippable, shown once
- PWA: manifest + service worker (app shell precache), auto-update on new deploys

**Needs the owner (can't be done by an agent):**
- A real Google OAuth Web Client (see "Connect Google Sheets" below)
- Real `VITE_ACCESS_CODES` before selling on Etsy
- App icon artwork — the PWA icons are still copied from the sibling project this was
  forked from (TrackerA); see `TODO.md`

## Connect Google Sheets (optional)

The app runs 100% on-device by default. To back up / sync to a spreadsheet in the
user's own Google Drive, add an OAuth client ID — a one-time, **free** Google Cloud
setup (~5 min). Then the **Settings → Google Sheets → Connect** button lights up.

### One-time Google Cloud setup
1. Go to <https://console.cloud.google.com/> and create a project (any name).
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill app
   name + your email → add yourself under **Test users** (while unverified, only
   test users can sign in).
4. On the OAuth consent screen's **Data Access** page, add the
   `https://www.googleapis.com/auth/drive.file` scope — this is a **separate step**
   from creating the OAuth client below, and it is not optional; skipping it produces
   confusing "app not verified"/"sign-in didn't complete" symptoms that look like a
   code bug but aren't. See `CLAUDE.md` for the full story if this happens.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   Application type **Web application**. Under **Authorized JavaScript origins** add:
   - `http://localhost:5516` (dev — the port this project runs on)
   - your production origin (e.g. `https://yourdomain.com`) when you deploy
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

### Wire it in
```bash
cp .env.example .env
# edit .env and paste the client ID:
# VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
npm run dev
```
Restart the dev server after editing `.env`. Open **Settings → Google Sheets →
Connect Google Sheets**. The app creates a spreadsheet titled *"Task Tracker"* in
your Drive, seeds it with your current data, and mirrors changes on every edit
(debounced). "Open my sheet" links straight to it.

**Scope:** only `drive.file` — the app can touch *only the sheet it creates*, nothing
else in your Drive. Going live for all users (not just test users) later needs Google's
consent-screen verification; not required to build or self-use.
