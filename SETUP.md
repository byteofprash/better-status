# Setup guide

You need four things: a **Talon.One** key, a **Slack** user token, **Google** OAuth credentials,
and the Talon.One configuration (attributes, custom effect, campaign — see the README).
About 20 minutes the first time. Put every value in your own `.env`; never commit it.

## 1. Talon.One

1. In the Campaign Manager, open your Application → **Settings → Integration API keys → Create key**.
   Copy it into `TALON_IAPI_KEY`.
2. `TALON_URL` is your deployment host, e.g. `mycompany.europe-west1.talon.one` (no `https://`).
3. Create the attributes, the `setSlackStatus` custom effect and the campaign from the README.
   Attributes and custom effects live under your account's developer tools. Create the
   attributes *before* the first event, or Talon.One rejects them.

Use a sandbox Application for the first run.

## 2. Slack user token

Better Status sets *your* status, so it uses a **user token**, not a bot token.

1. Go to <https://api.slack.com/apps> → **Create New App → From scratch**. Name it
   "Better Status" and pick your workspace.
2. **OAuth & Permissions → User Token Scopes** → add `users.profile:read` and `users.profile:write`.
   (Not "Bot Token Scopes".)
3. **Install to Workspace**. If your workspace requires app approval, this sends a request to an admin;
   wait for approval before continuing.
4. Copy the **User OAuth Token** (starts with `xoxp-`) into `SLACK_USER_TOKEN`.

The token can only change the status of the person who installed the app.

## 3. Google Calendar credentials

### 3a. Create the OAuth client
1. In <https://console.cloud.google.com>, create (or pick) a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen**: choose **Internal** if you use Google Workspace (recommended: refresh tokens don't
   expire). With **External** in *Testing* mode, refresh tokens expire after 7 days and you must add yourself as a test user.
   Add the scope `https://www.googleapis.com/auth/calendar.events.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Add this authorized redirect URI:
   `https://developers.google.com/oauthplayground`
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 3b. Get a refresh token (one time)
1. Open <https://developers.google.com/oauthplayground>.
2. Click the gear icon → tick **Use your own OAuth credentials** → paste your client ID and secret.
3. In the scope box enter `https://www.googleapis.com/auth/calendar.events.readonly` → **Authorize APIs** and sign in.
4. **Exchange authorization code for tokens**. Copy the **Refresh token** into `GOOGLE_REFRESH_TOKEN`.

The scope is read-only; Better Status never edits your calendar.

## 4. First run

```bash
cp .env.example .env     # fill in the values above
set -a; source .env; set +a
npm run dry              # calls Talon.One, prints the result, leaves Slack alone
```

Start a test meeting on your calendar (or run during one) and check the log line, e.g.
`"Acme sync" (external, one_on_one) -> :handshake: In an external 1:1`. Then:

```bash
npm run once             # also sets your Slack status
npm start                # keep polling
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Missing required env var ...` | The variable isn't exported; re-run `set -a; source .env; set +a`. |
| `Google token refresh failed: 400/401` | Wrong client secret, or an External/Testing refresh token older than 7 days. Redo 3b. |
| `Google Calendar failed: 403` | Calendar API not enabled, or the scope wasn't granted. |
| `Talon.One track event failed: 401` | Wrong key, or the key belongs to another Application. |
| `Talon.One track event failed: 400` | An attribute doesn't exist yet, or the type is wrong (`startTime`/`endTime` must be *time*). |
| `no rule matched` | The campaign is disabled, or no rule fires for this meeting. |
| `Slack users.profile.set failed: missing_scope` | Add the scopes under **User** Token Scopes and reinstall the app. |
| `Slack ... failed: not_allowed_token_type` | You used a bot token (`xoxb-`); use the user token (`xoxp-`). |
| Status doesn't change | You have a manual status set; Better Status leaves those alone. Clear it once and retry. |
