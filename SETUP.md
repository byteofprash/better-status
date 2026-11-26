# Deploying Better Status on Cloudflare (admin guide)

One deployment serves everyone. You configure the app once; each teammate then clicks
**Connect Slack**, **Connect Google Calendar** and enters **their own Talon.One URL and Integration API key**.

Architecture: one Worker serves the web app and OAuth routes, **D1** stores the encrypted user records, a
**Cron Trigger** fires every 5 minutes and drops everyone onto a **Queue** in chunks of 10, and queue consumers
(up to 10 in parallel) do the calendar → Talon.One → Slack work.

**Needs the Workers Paid plan ($5/month)** for Queues and the higher request limits.
Check Cloudflare's current pricing and limits.

## 0. Prerequisites
- A Cloudflare account on the Workers Paid plan.
- Node ≥ 22.18, and this repo cloned locally: `npm install`.
- Log in once: `npx wrangler login`.

## 1. Create the D1 database and the Queue
```bash
npx wrangler d1 create better-status
```
Copy the printed `database_id` into `wrangler.toml` (`REPLACE_WITH_YOUR_D1_ID`). Then:
```bash
npx wrangler queues create better-status-sync
npm run db:migrate          # creates the users table in the remote database
```

## 2. First deploy (to learn your URL)
```bash
npm run deploy
```
Wrangler prints your URL, `https://better-status.<your-subdomain>.workers.dev`. Put it into `wrangler.toml` as
`APP_URL` (no trailing slash; a custom domain works too), and deploy again at the end of step 5.

## 3. Slack app
1. <https://api.slack.com/apps> → **Create New App → From scratch**.
2. **OAuth & Permissions**:
   - **Redirect URLs** → add `APP_URL/api/auth/slack`.
   - **User Token Scopes** → `users.profile:read`, `users.profile:write`. Add **no** bot scopes.
3. Copy **Client ID** and **Client Secret** (Basic Information).
4. If your workspace requires app approval, an admin approves it once. No Marketplace listing is needed
   for internal use. (Enable *Manage Distribution* only if people outside your workspace will use it.)

## 4. Google OAuth client
1. In <https://console.cloud.google.com>: enable the **Google Calendar API**.
2. **OAuth consent screen**: pick **Internal** (Google Workspace) so refresh tokens don't expire.
   Add the scope `https://www.googleapis.com/auth/calendar.events.readonly`.
   (A public **External** app needs Google verification for this scope, and in *Testing* mode tokens expire after 7 days.)
3. **Credentials → OAuth client ID → Web application** with the redirect URI `APP_URL/api/auth/google`.
4. Copy the client ID and secret.

## 5. Secrets
Set each with `npx wrangler secret put <NAME>` (it prompts for the value):

| Secret | Value |
|---|---|
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | From step 3 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 4 |
| `ENCRYPTION_KEY` | `openssl rand -base64 32`. Encrypts stored tokens. **Back it up**: losing it makes stored data unreadable (users would reconnect). |
| `SESSION_SECRET` | `openssl rand -base64 32` |

Optional plain variable in `wrangler.toml` `[vars]`: `TALON_HOST_SUFFIXES` (default `.talon.one`) controls which
hosts users may enter. The Talon.One URL and key are **not** app settings: every user enters their own.

Then `npm run deploy` once more so `APP_URL` is live.

## 6. Check it works
1. Open `APP_URL`, **Connect Slack**, **Connect Google Calendar**, enter your Talon.One URL and key, and press
   **Test connection** (a dry-run event: nothing is written to Talon.One or Slack).
2. Watch the scheduler live: `npx wrangler tail`. Every 5 minutes you'll see the cron and queue consumer run.
3. Locally: `npm run dev` serves the app and exposes `curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`
   to fire the cron by hand. For local secrets create a `.dev.vars` file (git-ignored) with the same names as above.

## Operating it
- **Cadence:** `crons = ["*/5 * * * *"]` in `wrangler.toml`. A status can appear up to 5 minutes after a meeting
  starts (usually seconds, since most meetings start on a 5-minute mark; the check has a 30-second grace window).
  It always clears itself at the meeting's end via Slack's status expiry.
- **Users:** `npx wrangler d1 execute better-status --remote --command "SELECT id, updated_at FROM users"`.
  The blobs are encrypted; ids are `<slack team>-<slack user>`.
- **Errors:** each user's last error is shown on their settings page. `wrangler tail` shows infrastructure errors.
- **Scale:** each queue message handles 10 users and consumers run up to 10 at a time; raise
  `max_concurrency` in `wrangler.toml` for a bigger base.

## Security notes
- All per-user data (Slack token, Google refresh token, Talon URL and key) is stored as one AES-256-GCM
  encrypted blob. The key is never shown again after saving, only its last 4 characters.
- Users may only enter `https://*.talon.one` hosts, and redirects are not followed.
- **Disconnect & delete my data** revokes the Slack and Google tokens and deletes the record.
- Scopes: Slack `users.profile:read/write` (own profile only), Google Calendar **read-only**.
- Talon.One receives only: event title, start/end, internal/external, participant count and a hashed
  profile ID. No attendee emails.
- There is no public sync endpoint: the cron and queue are internal to Cloudflare.

## Local single-user mode
Skips Cloudflare and OAuth apps. Export these and run `npm run dry` (calls Talon.One only), `npm run once`
or `npm run cli` (polls):

```bash
export SLACK_USER_TOKEN=xoxp-...  GOOGLE_CLIENT_ID=...  GOOGLE_CLIENT_SECRET=...  GOOGLE_REFRESH_TOKEN=...
export TALON_URL=mycompany.europe-west1.talon.one  TALON_IAPI_KEY=...  INTERNAL_DOMAIN=talon.one
```

To get a Google refresh token for yourself, use the OAuth Playground with your own client
(<https://developers.google.com/oauthplayground>, gear icon → "Use your own OAuth credentials",
scope `https://www.googleapis.com/auth/calendar.events.readonly`).
