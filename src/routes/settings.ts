import { dashboard } from '../pages.ts';
import { revoke as slackRevoke } from '../slack.ts';
import { deleteUser, saveUser } from '../store.ts';
import { profileIdFor } from '../sync.ts';
import { evaluateMeeting } from '../talon.ts';
import { talonHost } from '../talonUrl.ts';
import { currentUser, endSession, page, redirect, sameOrigin } from '../web.ts';

export async function settings(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const user = await currentUser(req);
  if (!user) return redirect('/');
  const form = await req.formData();
  const action = String(form.get('action') ?? '');
  const show = (ok: boolean, text: string) => page(dashboard(user, { ok, text }));

  if (action === 'disconnect') {
    await Promise.allSettled([
      slackRevoke(user.slackToken),
      user.googleRefreshToken &&
        fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(user.googleRefreshToken)}`, { method: 'POST' }),
    ]);
    await deleteUser(user.id);
    return redirect('/', [endSession()]);
  }

  if (action === 'save') {
    try {
      const url = String(form.get('talonUrl') ?? '').trim();
      if (url) user.talonUrl = talonHost(url); // normalised host only
      const key = String(form.get('talonKey') ?? '').trim();
      if (key) user.talonKey = key; // blank = keep the saved key
    } catch (e) {
      return show(false, (e as Error).message);
    }
    await saveUser(user);
    return show(true, 'Saved.');
  }

  if (action === 'test') {
    if (!user.talonUrl || !user.talonKey) return show(false, 'Save your URL and key first.');
    const now = Date.now();
    try {
      const status = await evaluateMeeting(
        { talonUrl: user.talonUrl, talonKey: user.talonKey },
        profileIdFor(user.id),
        {
          integrationId: `bs-test-${now}`,
          name: 'Better Status test',
          start: new Date(now).toISOString(),
          end: new Date(now + 1800_000).toISOString(),
          scope: 'external',
          participantType: 'one_on_one',
          participantCount: 2,
        },
        { dry: true },
      );
      return status
        ? show(true, `Works. An external 1:1 would set: ${status.emoji} ${status.text}`)
        : show(false, 'Talon.One answered, but no rule returned the setSlackStatus effect. Is the campaign enabled and matching?');
    } catch (e) {
      return show(false, (e as Error).message);
    }
  }
  return show(false, 'Unknown action.');
}
