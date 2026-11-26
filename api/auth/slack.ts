import { loadUser, saveUser } from '../../src/store.ts';
import { appUrl, checkState, clearState, newState, redirect, startSession } from '../../src/web.ts';

const SCOPES = 'users.profile:read,users.profile:write';

/** Start (no `code`) and callback (`code`) of Slack "Add to Slack", user scopes only. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const redirectUri = `${appUrl()}/api/auth/slack`;

  if (!q.has('code')) {
    if (q.has('error')) return redirect('/?error=Slack%20connection%20was%20cancelled');
    const { state, setCookie } = newState();
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', process.env.SLACK_CLIENT_ID!);
    url.searchParams.set('user_scope', SCOPES);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return redirect(url.toString(), [setCookie]);
  }

  if (!checkState(req, q.get('state'))) return redirect('/?error=Invalid%20state%2C%20please%20try%20again', [clearState()]);
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code: q.get('code')!,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await res.json()) as {
    ok: boolean;
    error?: string;
    team?: { id: string };
    authed_user?: { id: string; access_token?: string };
  };
  const token = body.authed_user?.access_token;
  if (!body.ok || !token || !body.team?.id) return redirect('/?error=Slack%20sign-in%20failed', [clearState()]);

  const id = `${body.team.id}-${body.authed_user!.id}`;
  const user = (await loadUser(id)) ?? { id, slackToken: token, state: {} };
  user.slackToken = token;
  user.state.lastError = undefined;
  await saveUser(user);
  return redirect('/', [startSession(id), clearState()]);
}
