import { safeEqual } from '../../src/crypto.ts';
import { listUserIds, loadUser, saveUser } from '../../src/store.ts';
import { isComplete, syncUser } from '../../src/sync.ts';

export const maxDuration = 60;

const BATCH = 10;

/** Called every minute by Vercel Cron (or any scheduler) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`))
    return new Response('Unauthorized', { status: 401 });

  const app = { googleClientId: process.env.GOOGLE_CLIENT_ID!, googleClientSecret: process.env.GOOGLE_CLIENT_SECRET! };
  const ids = await listUserIds();
  const deadline = Date.now() + 50_000;
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < ids.length && Date.now() < deadline; i += BATCH) {
    await Promise.all(
      ids.slice(i, i + BATCH).map(async (id) => {
        const user = await loadUser(id);
        if (!user || !isComplete(user)) return;
        try {
          await syncUser(user, app);
          user.state.lastError = undefined;
          synced++;
        } catch (e) {
          user.state.lastError = (e as Error).message.slice(0, 300);
          failed++;
        }
        user.state.lastSyncAt = new Date().toISOString();
        await saveUser(user);
      }),
    );
  }
  return Response.json({ users: ids.length, synced, failed });
}
