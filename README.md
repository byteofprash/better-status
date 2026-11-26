# Better Status

Google Calendar → **Talon.One rules** → Slack status, for you and your team.

The service only reports *facts* about the meeting you're in. Talon.One decides what your
status should be, so wording, emoji and priorities are edited in the Campaign Manager, not in code.

```
Calendar ──▶ Better Status ──(POST /v3/events)──▶ your Talon.One rules
                  ▲                                      │
                  └──── customEffect "setSlackStatus" ◀──┘
Better Status ──▶ Slack users.profile.set (text, emoji, expires at meeting end)
```

## How teammates use it
Open the app → **Connect Slack** → **Connect Google Calendar** → enter your own Talon.One URL and
Integration API key → **Test connection**. Admins deploy it once: see [SETUP.md](SETUP.md)
(Vercel + Upstash Redis).

## Talon.One setup (each user, one time, in their Campaign Manager)

**1. Attributes on the *Event* entity**

| Name | Type | Values |
|---|---|---|
| `eventName` | string | |
| `startTime`, `endTime` | time | |
| `scope` | string | `internal`, `external` |
| `participantType` | string | `solo`, `one_on_one`, `group` |
| `participantCount` | number | |

**2. Custom effect** named `setSlackStatus` with string parameters `text` and `emoji`
(Slack shortcode, e.g. `:handshake:`).

**3. Campaign** triggered by the custom event `meeting_started`, ruleset set to stop at the first
matching rule. Suggested rules, in order:

1. `eventName` contains `pickup` / `kindergarten` → `:school_satchel:` "Kindergarten pickup"
2. `eventName` contains `lunch` → `:fork_and_knife:` "At lunch"
3. `scope` = external, `participantType` = one_on_one → `:handshake:` "In an external 1:1"
4. `scope` = external → `:microphone:` "In an external meeting"
5. `scope` = internal, `participantType` = one_on_one → `:speech_balloon:` "In a 1:1"
6. `scope` = internal → `:busts_in_silhouette:` "In an internal meeting"

**4. Integration API key** for the application. (Event attributes are sent as-is, so they must
exist before the first event.)

New here? Follow [SETUP.md](SETUP.md) for the Slack, Google and Talon.One credentials.

## Behaviour

- One Talon.One event per meeting (re)start. The event ID includes a fingerprint of the event, so
  an edited meeting is re-evaluated and an unchanged one is never sent twice.
- Skipped: declined, cancelled, all-day and "free" events. Overlaps: the latest-started meeting wins.
- `internal`/`external` comes from attendee email domains; emails are **not** sent to Talon.One.
  The profile ID is a hash of the Slack team/user ID.
- The status expires at the meeting's end, so it clears itself. A status set by hand is never overwritten.
- No rule matched → status left alone.
- A scheduler (Vercel Cron, every minute) checks everyone's calendar; Google Calendar has no
  "meeting started" webhook.

## Development

Node ≥ 22.18, no dependencies: `npm test`. Local single-user mode: see the end of [SETUP.md](SETUP.md).
