import { loadUser, saveUserState } from './store.ts';
import { isComplete, syncUser } from './sync.ts';
import type { AppCreds } from './types.ts';

export const CHUNK = 10;

export const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/** Sync a handful of users. One user's failure is recorded on that user and never stops the rest. */
export async function syncUsers(ids: string[], app: AppCreds): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  for (const id of ids) {
    const user = await loadUser(id);
    if (!user || !isComplete(user)) continue;
    try {
      await syncUser(user, app);
      user.state.lastError = undefined;
      synced++;
    } catch (e) {
      user.state.lastError = (e as Error).message.slice(0, 300);
      failed++;
    }
    user.state.lastSyncAt = new Date().toISOString();
    await saveUserState(id, user.state);
  }
  return { synced, failed };
}
