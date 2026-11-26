import type { AppCreds } from './types.ts';
import type { GCalEvent } from './meeting.ts';

async function accessToken(app: AppCreds, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      client_id: app.googleClientId,
      client_secret: app.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}) - reconnect Google Calendar`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Cron jitter / a tick a few seconds early must not miss a meeting that is about to start. */
export const GRACE_MS = 30_000;

/** Events happening right now (or starting within GRACE_MS) on the primary calendar, plus the calendar owner's email. */
export async function currentEvents(
  app: AppCreds,
  refreshToken: string,
  now = new Date(),
): Promise<{ events: GCalEvent[]; selfEmail: string }> {
  const token = await accessToken(app, refreshToken);
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('timeMax', new Date(now.getTime() + GRACE_MS).toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('fields', 'summary,items(id,summary,status,transparency,start,end,attendees,organizer)');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Google Calendar failed (${res.status})`);
  const body = (await res.json()) as { summary?: string; items?: GCalEvent[] };
  // For the primary calendar, `summary` is the owner's email address.
  return { events: body.items ?? [], selfEmail: body.summary ?? '' };
}
