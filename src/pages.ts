import type { UserRecord } from './types.ts';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const layout = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Better Status</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#ddd;--acc:#4a2cff;--ok:#127a3d;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mut:#9a9a9a;--line:#333;--acc:#8d7bff;--ok:#5ac487;--bad:#ff8a80}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;padding:0 16px}
main{max-width:640px;margin:0 auto;padding-block:40px}
h1{margin:0 0 4px}.mut{color:var(--mut)}
.card{border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}
.ok{color:var(--ok)}.bad{color:var(--bad)}
label{display:block;margin:12px 0 4px;font-weight:600}
input[type=text],input[type=password]{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit}
button,.btn{display:inline-block;padding:8px 14px;border-radius:6px;border:1px solid var(--acc);background:var(--acc);color:#fff;text-decoration:none;cursor:pointer;font:inherit;margin:10px 8px 0 0}
button.sec{background:transparent;color:var(--acc)}button.danger{background:transparent;border-color:var(--bad);color:var(--bad)}
code{background:rgba(127,127,127,.15);padding:1px 5px;border-radius:4px}
</style></head><body><main>${body}</main></body></html>`;

export function landing(msg?: string): string {
  return layout(`<h1>Better Status</h1>
<p class="mut">Your Slack status follows your calendar: external or internal meeting, lunch, kindergarten pickup. Talon.One rules decide the wording.</p>
${msg ? `<p class="bad">${esc(msg)}</p>` : ''}
<a class="btn" href="/api/auth/slack">Connect Slack</a>`);
}

const mask = (k?: string) => (k ? `saved (…${esc(k.slice(-4))})` : 'Integration API key');

export function dashboard(u: UserRecord, msg?: { ok: boolean; text: string }): string {
  const s = u.state;
  return layout(`<h1>Better Status</h1>
${msg ? `<p class="${msg.ok ? 'ok' : 'bad'}">${esc(msg.text)}</p>` : ''}
<div class="card"><b>1. Slack</b> <span class="ok">connected</span></div>
<div class="card"><b>2. Google Calendar</b>
${u.googleRefreshToken ? '<span class="ok">connected</span>' : '<br><a class="btn" href="/api/auth/google">Connect Google Calendar</a>'}</div>
<div class="card"><b>3. Your Talon.One</b>
<form method="post" action="/api/settings">
<label for="u">Deployment URL</label>
<input id="u" name="talonUrl" type="text" placeholder="mycompany.europe-west1.talon.one" value="${esc(u.talonUrl)}" autocomplete="off">
<label for="k">Integration API key</label>
<input id="k" name="talonKey" type="password" placeholder="${mask(u.talonKey)}" autocomplete="off">
<button name="action" value="save">Save</button>
<button class="sec" name="action" value="test">Test connection</button>
</form>
<details><summary class="mut">What must exist in Talon.One</summary>
<ul><li>Event attributes: <code>eventName</code>, <code>startTime</code>, <code>endTime</code> (time), <code>scope</code>, <code>participantType</code>, <code>participantCount</code></li>
<li>Custom effect <code>setSlackStatus</code> with parameters <code>text</code>, <code>emoji</code></li>
<li>A campaign triggered by the custom event <code>meeting_started</code> whose rules fire that effect</li></ul></details></div>
<div class="card"><b>Status</b>
<p class="mut">Last check: ${esc(s.lastSyncAt ?? 'not yet')}<br>
Last status set: ${s.ours ? esc(`${s.ours.emoji} ${s.ours.text}`) : 'none'}</p>
${s.lastError ? `<p class="bad">${esc(s.lastError)}</p>` : ''}</div>
<form method="post" action="/api/settings" onsubmit="return confirm('Disconnect and delete all stored data?')">
<button class="danger" name="action" value="disconnect">Disconnect &amp; delete my data</button></form>`);
}
