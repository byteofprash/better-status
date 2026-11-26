/**
 * Config lookup that works in Node (process.env) and in a Cloudflare Worker, where the
 * `env` object is handed to each handler. The worker calls setEnv() first thing.
 */
let current: Record<string, unknown> = typeof process !== 'undefined' ? (process.env as Record<string, unknown>) : {};
export const setEnv = (e: object) => void (current = e as Record<string, unknown>);
export const env = (k: string): string | undefined => {
  const v = current[k];
  return typeof v === 'string' ? v : undefined;
};
