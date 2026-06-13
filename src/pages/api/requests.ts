import type { APIRoute } from 'astro';
import { getData } from '@/lib/server/data';
import { getSession } from '@/lib/server/session';
import { sendPurchaseRequestMail } from '@/lib/server/email';
import { estimateTotal, formatPrice } from '@/lib/format';

/** 購入リクエストの作成。{ listingId, qty, message? } を受け取り保存＋出品者へメール通知。 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime?.env;
  const data = getData(env);
  const session = await getSession({ locals, cookies, request });
  if (!session.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: { listingId?: unknown; qty?: unknown; message?: unknown };
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const listingId = payload.listingId;
  if (typeof listingId !== 'string' || !listingId) {
    return new Response(JSON.stringify({ error: 'listingId_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const listing = await data.getListing(listingId);
  if (!listing || listing.status !== 'published') {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 数量: sawn は 1〜在庫、irregular は常に1。
  const rawQty = Number(payload.qty);
  let qty = Number.isFinite(rawQty) ? Math.floor(rawQty) : 1;
  if (listing.shape === 'irregular') {
    qty = 1;
  } else {
    qty = Math.min(Math.max(1, qty), Math.max(1, listing.stock));
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : undefined;
  const estimatedTotal = estimateTotal(listing, qty);

  const req = await data.createPurchaseRequest({
    listingId: listing.id,
    buyerId: session.user.id,
    qty,
    estimatedTotal,
    message: message || undefined,
  });

  // 出品者へメール通知（スタブ可）。失敗してもリクエスト保存は成功扱い。
  await sendPurchaseRequestMail(
    {
      // mock では出品者メールアドレスを持たないため、スタブ表示用のプレースホルダ。
      to: `${listing.seller.id}@example.com`,
      sellerName: listing.seller.companyName,
      listingTitle: listing.title,
      qty,
      estimatedTotalLabel: formatPrice(estimatedTotal),
      buyerName: session.user.name,
      message: message || undefined,
    },
    env
  );

  return new Response(
    JSON.stringify({ ok: true, id: req.id, estimatedTotal }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
