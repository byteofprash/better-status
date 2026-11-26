import { env, setEnv } from './env.ts';
import { chunk, CHUNK, syncUsers } from './runSync.ts';
import { googleAuth } from './routes/google.ts';
import { home } from './routes/home.ts';
import { settings } from './routes/settings.ts';
import { slackAuth } from './routes/slack.ts';
import { d1Store, listUserIds, useStore, type D1Like } from './store.ts';

interface Queue {
  sendBatch(msgs: { body: unknown }[]): Promise<void>;
}
export interface Env {
  DB: D1Like;
  SYNC_QUEUE: Queue;
  [k: string]: unknown;
}
interface QueueBatch {
  messages: { body: { ids: string[] }; ack(): void; retry(): void }[];
}

const init = (e: Env) => {
  setEnv(e);
  useStore(d1Store(e.DB));
};

export default {
  /** The web app: landing/settings page and the two OAuth flows. */
  async fetch(req: Request, e: Env): Promise<Response> {
    init(e);
    const { pathname } = new URL(req.url);
    try {
      if (req.method === 'GET' && pathname === '/') return await home(req);
      if (req.method === 'GET' && pathname === '/api/auth/slack') return await slackAuth(req);
      if (req.method === 'GET' && pathname === '/api/auth/google') return await googleAuth(req);
      if (req.method === 'POST' && pathname === '/api/settings') return await settings(req);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('request failed', pathname, (err as Error).message);
      return new Response('Something went wrong. Please try again.', { status: 500 });
    }
  },

  /** Cron (every 5 min): enqueue everyone in chunks. Queue consumers do the real work in parallel. */
  async scheduled(_c: unknown, e: Env): Promise<void> {
    init(e);
    const msgs = chunk(await listUserIds(), CHUNK).map((ids) => ({ body: { ids } }));
    for (const batch of chunk(msgs, 100)) await e.SYNC_QUEUE.sendBatch(batch);
  },

  /** One message = up to CHUNK users. Each invocation gets its own request budget. */
  async queue(batch: QueueBatch, e: Env): Promise<void> {
    init(e);
    const app = { googleClientId: env('GOOGLE_CLIENT_ID')!, googleClientSecret: env('GOOGLE_CLIENT_SECRET')! };
    for (const m of batch.messages) {
      try {
        await syncUsers(m.body.ids, app);
        m.ack();
      } catch (err) {
        console.error('sync batch failed', (err as Error).message); // infra failure (e.g. D1): retry
        m.retry();
      }
    }
  },
};
