# Deploying Better Status (admin guide)

One deployment serves everyone. You configure the app once; each teammate then clicks
**Connect Slack**, **Connect Google Calendar** and enters **their own Talon.One URL and Integration API key**.

## Environment variables (Vercel project settings)

| Variable | Value |
|---|---|
| `APP_URL` | Production URL, no trailing slash, e.g. `https://better-status.vercel.app` |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | From your Slack app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From your Google OAuth client |
| `ENCRYPTION_KEY` | `openssl rand -base64 32`. Encrypts stored tokens. |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32`. Vercel Cron sends it automatically. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Added by the Upstash Redis integration |
| `TALON_HOST_SUFFIXES` | Optional, default `.talon.one`. Which hosts users may enter (SSRF guard). |

The Talon.One URL and Integration API key are **not** app settings: every user enters their own.
Losing `ENCRYPTION_KEY` makes stored tokens unreadable (users would have to reconnect).

## 1. Create the Vercel project
1. Import this repo into Vercel. Its production URL is your `APP_URL`.
2. **Storage → Marketplace → Upstash Redis** → connect it to the project.
3. Add the environment variables above.

## 2. Slack app
1. <https://api.slack.com/apps> → **Create New App → From scratch**.
2. **OAuth & Permissions**:
   - **Redirect URLs** → add `APP_URL/api/auth/slack`.
   - **User Token Scopes** → `users.profile:read`, `users.profile:write`. Add **no** bot scopes.
3. Copy **Client ID** / **Client Secret** (Basic Information) into the env vars.
4. If your workspace requires app approval, an admin approves it once. No Marketplace listing is needed
   for internal use. (Enable *Manage Distribution* only if people outside your workspace will use it.)

## 3. Google OAuth client
1. In <https://console.cloud.google.com>: enable the **Google Calendar API**.
2. **OAuth consent screen**: pick **Internal** (Google Workspace) so refresh tokens don't expire.
   Add the scope `https://www.googleapis.com/auth/calendar.events.readonly`.
   (A public **External** app needs Google verification for this scope.)
3. **Credentials → OAuth client ID → Web application** with the redirect URI `APP_URL/api/auth/google`.
4. Put the client ID/secret into the env vars.

## 4. The scheduler
Serverless functions only run when called, and Google Calendar has no "meeting started" webhook
(its push notifications fire on event *changes* only), so a clock is needed.
`vercel.json` runs `/api/cron/sync` **every minute**. Per-minute cron needs the Vercel **Pro** plan;
on Hobby the deploy is rejected. On Hobby: delete the `crons` block and have any pinger (e.g. cron-job.org,
or an Apps Script time trigger) call `GET APP_URL/api/cron/sync` every minute with the header
`Authorization: Bearer <CRON_SECRET>`.

Each run handles users in batches of 10 within a 50-second budget, which is plenty for a team.
For hundreds of users, fan out per user (queue) instead.

## 5. Redeploy and check
Visit `APP_URL` and connect your own account first. **Test connection** sends a *dry-run* event, so nothing is
written to Talon.One or Slack.

## Security notes
- All per-user data (Slack token, Google refresh token, Talon URL and key) is stored as one AES-256-GCM
  encrypted blob. The key is never shown again after saving, only its last 4 characters.
- Users may only enter `https://*.talon.one` hosts, and redirects are refused.
- **Disconnect & delete my data** revokes the Slack and Google tokens and deletes the record.
- Scopes: Slack `users.profile:read/write` (own profile only), Google Calendar **read-only**.
- Talon.One receives only: event title, start/end, internal/external, participant count and a hashed
  profile ID. No attendee emails.

## Local single-user mode
Skips Vercel, Redis and OAuth apps. Export these and run `npm run dry` (calls Talon.One only), `npm run once`
or `npm run cli` (polls):

```bash
export SLACK_USER_TOKEN=xoxp-...  GOOGLE_CLIENT_ID=...  GOOGLE_CLIENT_SECRET=...  GOOGLE_REFRESH_TOKEN=...
export TALON_URL=mycompany.europe-west1.talon.one  TALON_IAPI_KEY=...  INTERNAL_DOMAIN=talon.one
```

Getting a Google refresh token for yourself: use the OAuth Playground with your own client
(<https://developers.google.com/oauthplayground>, gear icon → "Use your own OAuth credentials",
scope `https://www.googleapis.com/auth/calendar.events.readonly`).
