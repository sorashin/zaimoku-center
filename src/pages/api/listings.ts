import type { APIRoute } from 'astro';
import { getData } from '@/lib/server/data';
import { getSession } from '@/lib/server/session';
import {
  validateListingPayload,
  buildUpdateInput,
  type ListingFormPayload,
} from '@/lib/listingInput';
import type { UpdateListingInput } from '@/lib/server/data';
import type { ListingStatus } from '@/lib/types';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_STATUS: ListingStatus[] = ['published', 'closed', 'sold'];

/** 新規出品（seller 限定）。 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const data = getData(locals.runtime?.env);
  const session = await getSession({ locals, cookies, request });
  if (!session.user) return json({ error: 'unauthorized' }, 401);
  const sellerId = session.user.sellerProfile?.sellerId;
  if (session.user.role !== 'seller' || !sellerId) {
    return json({ error: 'forbidden' }, 403);
  }

  let payload: ListingFormPayload;
  try {
    payload = (await request.json()) as ListingFormPayload;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const result = validateListingPayload(payload, sellerId);
  if (!result.ok || !result.input) {
    return json({ error: 'validation', message: result.error }, 400);
  }

  const created = await data.createListing(result.input);
  return json({ ok: true, id: created.id }, 200);
};

/** 出品の更新（seller + 所有チェック）。フルフォーム更新 or ステータスのみ変更。 */
export const PATCH: APIRoute = async ({ request, cookies, locals }) => {
  const data = getData(locals.runtime?.env);
  const session = await getSession({ locals, cookies, request });
  if (!session.user) return json({ error: 'unauthorized' }, 401);
  const sellerId = session.user.sellerProfile?.sellerId;
  if (session.user.role !== 'seller' || !sellerId) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: ListingFormPayload & { id?: unknown; status?: unknown; statusOnly?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return json({ error: 'id_required' }, 400);

  // 所有チェック: 全ステータスを対象に取得（getListing は status 問わず引ける）。
  const existing = await data.getListing(id);
  if (!existing) return json({ error: 'not_found' }, 404);
  if (existing.sellerId !== sellerId) return json({ error: 'forbidden' }, 403);

  // ステータスのみ変更モード。
  if (body.statusOnly === true) {
    const status = body.status;
    if (typeof status !== 'string' || !VALID_STATUS.includes(status as ListingStatus)) {
      return json({ error: 'invalid_status' }, 400);
    }
    const updated = await data.updateListing(id, { status: status as ListingStatus });
    return json({ ok: true, id, status: updated?.status }, 200);
  }

  // フルフォーム更新。
  const result = validateListingPayload(body, sellerId);
  if (!result.ok || !result.input) {
    return json({ error: 'validation', message: result.error }, 400);
  }
  const patch: UpdateListingInput = buildUpdateInput(result.input);
  // ステータスは既存を維持（フォームでは変更しない）。
  patch.status = existing.status;
  const updated = await data.updateListing(id, patch);
  return json({ ok: true, id: updated?.id }, 200);
};

/** 出品の削除（seller + 所有チェック）。 */
export const DELETE: APIRoute = async ({ request, cookies, locals }) => {
  const data = getData(locals.runtime?.env);
  const session = await getSession({ locals, cookies, request });
  if (!session.user) return json({ error: 'unauthorized' }, 401);
  const sellerId = session.user.sellerProfile?.sellerId;
  if (session.user.role !== 'seller' || !sellerId) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return json({ error: 'id_required' }, 400);

  const existing = await data.getListing(id);
  if (!existing) return json({ error: 'not_found' }, 404);
  if (existing.sellerId !== sellerId) return json({ error: 'forbidden' }, 403);

  const ok = await data.deleteListing(id);
  return json({ ok }, 200);
};
