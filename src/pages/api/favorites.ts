import type { APIRoute } from 'astro';
import { getData } from '@/lib/server/data';
import { getSession } from '@/lib/server/session';

/** お気に入りのトグル。{ listingId } を受け取り、{ saved } を返す。 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const data = getData(locals.runtime?.env);
  const session = await getSession({ locals, cookies, request });
  if (!session.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let listingId: unknown;
  try {
    const body = await request.json();
    listingId = body?.listingId;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof listingId !== 'string' || !listingId) {
    return new Response(JSON.stringify({ error: 'listingId_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const listing = await data.getListing(listingId);
  if (!listing) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const saved = await data.toggleFavorite(session.user.id, listingId);
  return new Response(JSON.stringify({ saved }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
