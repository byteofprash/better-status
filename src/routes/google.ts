import { env } from '../env.ts';
import { saveUser } from '../store.ts';
import { appUrl, checkState, clearState, currentUser, newState, redirect } from '../web.ts';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

export async function googleAuth(req: Request) {
  const user = await currentUser(req);
  if (!user) return redirect('/?error=Connect%20Slack%20first');
  const q = new URL(req.url).searchParams;
  const redirectUri = `${appUrl()}/api/auth/google`;

  if (!q.has('code')) {
    if (q.has('error')) return redirect('/');
    const { state, setCookie } = newState();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env('GOOGLE_CLIENT_ID')!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('access_type', 'offline'); // ask for a refresh token
    url.searchParams.set('prompt', 'consent'); // ...even if they connected before
    url.searchParams.set('state', state);
    return redirect(url.toString(), [setCookie]);
  }

  if (!checkState(req, q.get('state'))) return redirect('/?error=Invalid%20state%2C%20please%20try%20again', [clearState()]);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      code: q.get('code')!,
      client_id: env('GOOGLE_CLIENT_ID')!,
      client_secret: env('GOOGLE_CLIENT_SECRET')!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = (await res.json()) as { refresh_token?: string };
  if (!res.ok || !body.refresh_token) return redirect('/?error=Google%20sign-in%20failed', [clearState()]);

  user.googleRefreshToken = body.refresh_token;
  user.state.lastError = undefined;
  await saveUser(user);
  return redirect('/', [clearState()]);
}
