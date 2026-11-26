import { dashboard, landing } from '../pages.ts';
import { currentUser, page } from '../web.ts';

export async function home(req: Request) {
  const err = new URL(req.url).searchParams.get('error');
  const user = await currentUser(req);
  return page(user ? dashboard(user) : landing(err ?? undefined));
}
