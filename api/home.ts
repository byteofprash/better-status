import { dashboard, landing } from '../src/pages.ts';
import { currentUser, page } from '../src/web.ts';

export async function GET(req: Request) {
  const err = new URL(req.url).searchParams.get('error');
  const user = await currentUser(req);
  return page(user ? dashboard(user) : landing(err ?? undefined));
}
