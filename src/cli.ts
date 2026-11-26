// Single-user mode for local testing: credentials come from env vars (see .env.example).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { syncUser } from './sync.ts';
import type { UserRecord } from './types.ts';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env var ${k}`);
  return v;
};
const STATE_FILE = new URL('../.state.json', import.meta.url);
const args = new Set(process.argv.slice(2));
const app = { googleClientId: need('GOOGLE_CLIENT_ID'), googleClientSecret: need('GOOGLE_CLIENT_SECRET') };
const user: UserRecord = {
  id: process.env.PROFILE_ID ?? 'local',
  slackToken: need('SLACK_USER_TOKEN'),
  googleRefreshToken: need('GOOGLE_REFRESH_TOKEN'),
  talonUrl: need('TALON_URL'),
  talonKey: need('TALON_IAPI_KEY'),
  internalDomain: process.env.INTERNAL_DOMAIN,
  state: existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {},
};
const log = (s: string) => console.log(`[${new Date().toISOString()}] ${s}`);

async function tick() {
  try {
    await syncUser(user, app, { dry: args.has('--dry'), log });
    if (!args.has('--dry')) writeFileSync(STATE_FILE, JSON.stringify(user.state));
  } catch (e) {
    console.error(`[${new Date().toISOString()}]`, (e as Error).message);
    process.exitCode = 1;
  }
}

await tick();
if (!args.has('--once')) setInterval(tick, Number(process.env.POLL_SECONDS ?? 60) * 1000);
