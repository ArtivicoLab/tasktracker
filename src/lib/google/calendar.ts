// Typed Google Calendar REST wrapper (TODO.md #2). Mirrors google/sheets.ts:
// raw fetch + bearer token, single transparent retry on 401. No dedicated
// calendar — everything lives on the user's "primary" calendar.

import { addDaysISO, todayISO } from "../dates";
import { invalidateToken, requestToken, SCOPE_CALENDAR } from "./auth";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// reminders.ts's own doc comment calls this "fire-and-forget... a reminder is
// a nice-to-have, never a reason to fail the task/bill save" — so it must
// NEVER interactively prompt. It used to fall back to an unattended popup
// exactly like the old sheets.ts bug (same root cause, this file was just
// never updated when that one was fixed) — every task/bill save with a
// reminder on would silently need a fresh calendar.events token, which
// popped a real Google sign-in window on every single save. guard() in
// reminders.ts already swallows any error here, so failing fast and quiet
// is strictly correct: no popup, no visible failure, the reminder just
// doesn't sync that time.
async function authedFetch(
  url: string,
  init: RequestInit = {},
  retry = true
): Promise<Response> {
  const token = await requestToken(SCOPE_CALENDAR, false);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 401 && retry) {
    invalidateToken(SCOPE_CALENDAR); // the cached token looked valid locally but the server just rejected it
    return authedFetch(url, init, false);
  }
  return res;
}

async function ok(res: Response): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function allDayBody(summary: string, date: string, description?: string) {
  return {
    summary,
    description,
    start: { date },
    end: { date: addDaysISO(date, 1) }, // all-day events use an exclusive end date
  };
}

/** Create an all-day event. Returns the created event's id. */
export async function createEvent(
  summary: string,
  date: string,
  description?: string
): Promise<string> {
  const res = await authedFetch(BASE, {
    method: "POST",
    body: JSON.stringify(allDayBody(summary, date, description)),
  });
  const json = (await ok(res)) as { id: string };
  return json.id;
}

export async function updateEvent(
  eventId: string,
  summary: string,
  date: string,
  description?: string
): Promise<void> {
  const res = await authedFetch(`${BASE}/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(allDayBody(summary, date, description)),
  });
  await ok(res);
}

/** Treats "already gone" (404/410) as success — nothing left to clean up. */
export async function deleteEvent(eventId: string): Promise<void> {
  const res = await authedFetch(`${BASE}/${eventId}`, { method: "DELETE" });
  if (res.ok || res.status === 404 || res.status === 410) return;
  await ok(res);
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function digestBody(time: string, summary: string) {
  const date = todayISO(); // only anchors the first occurrence; RRULE repeats it daily
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const endTime = addMinutes(time, 15);
  const endDate = endTime < time ? addDaysISO(date, 1) : date;
  return {
    summary,
    start: { dateTime: `${date}T${time}:00`, timeZone },
    end: { dateTime: `${endDate}T${endTime}:00`, timeZone },
    recurrence: ["RRULE:FREQ=DAILY"],
  };
}

/**
 * Create or move the single recurring daily-digest event. Returns its id
 * (unchanged on update). Falls back to creating a fresh event if the stored
 * id was deleted out from under us (e.g. the user removed it in Calendar).
 */
export async function createOrUpdateDailyDigest(
  existingEventId: string,
  time: string,
  summary: string
): Promise<string> {
  if (!existingEventId) {
    const res = await authedFetch(BASE, {
      method: "POST",
      body: JSON.stringify(digestBody(time, summary)),
    });
    const json = (await ok(res)) as { id: string };
    return json.id;
  }
  const res = await authedFetch(`${BASE}/${existingEventId}`, {
    method: "PATCH",
    body: JSON.stringify(digestBody(time, summary)),
  });
  if (res.status === 404 || res.status === 410) {
    return createOrUpdateDailyDigest("", time, summary);
  }
  await ok(res);
  return existingEventId;
}
