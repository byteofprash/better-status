/**
 * Users supply their own Talon.One URL, and the server calls it. To prevent SSRF
 * (pointing us at internal addresses) only plain https hosts under *.talon.one are accepted.
 */
const SUFFIXES = (process.env.TALON_HOST_SUFFIXES ?? '.talon.one').split(',').map((s) => s.trim().toLowerCase());

export function talonHost(input: string): string {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('That is not a valid URL.');
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.port || u.username || u.password)
    throw new Error('Use a plain https URL without port or credentials.');
  if (!SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length) || /^[\d.]+$/.test(host) || host.includes(':'))
    throw new Error(`The URL must be a Talon.One host (${SUFFIXES.map((s) => '*' + s).join(', ')}).`);
  return host;
}
