import { createHash } from 'node:crypto';
import { currentEvents } from './calendar.ts';
import { pickCurrent, toMeeting } from './meeting.ts';
import * as slack from './slack.ts';
import { evaluateMeeting } from './talon.ts';
import type { AppCreds, SlackStatus, UserRecord } from './types.ts';

const same = (a: SlackStatus, b: { text: string; emoji: string }) => a.text === b.text && a.emoji === b.emoji;

/** Pseudonymous Talon.One profile ID: no email or Slack ID leaves this service. */
export const profileIdFor = (userId: string) => 'bs-' + createHash('sha256').update(userId).digest('hex').slice(0, 24);

export const isComplete = (u: UserRecord) => Boolean(u.slackToken && u.googleRefreshToken && u.talonUrl && u.talonKey);

/** One pass for one user. Mutates `user.state`; the caller persists it. */
export async function syncUser(
  user: UserRecord,
  app: AppCreds,
  opts: { dry?: boolean; log?: (s: string) => void } = {},
): Promise<void> {
  const log = opts.log ?? (() => {});
  const state = user.state;
  const { events, selfEmail } = await currentEvents(app, user.googleRefreshToken!);
  const internalDomain = user.internalDomain ?? selfEmail.split('@')[1] ?? '';
  const meeting = pickCurrent(events.map((e) => toMeeting(e, selfEmail, internalDomain)).filter((m) => m !== null));

  if (!meeting) {
    state.lastIntegrationId = undefined; // status clears itself via its expiry
    return;
  }
  if (meeting.integrationId === state.lastIntegrationId) return; // already handled

  const status = await evaluateMeeting({ talonUrl: user.talonUrl!, talonKey: user.talonKey! }, profileIdFor(user.id), meeting);
  state.lastIntegrationId = meeting.integrationId;
  log(`"${meeting.name}" (${meeting.scope}, ${meeting.participantType}) -> ${status ? `${status.emoji} ${status.text}` : 'no rule matched'}`);
  if (!status || opts.dry) return;

  const current = await slack.getStatus(user.slackToken);
  const manual = current.text !== '' && !(state.ours && same(state.ours, current));
  if (manual) return log('Existing manual Slack status left untouched.');

  await slack.setStatus(user.slackToken, status, meeting.end);
  state.ours = status;
}
