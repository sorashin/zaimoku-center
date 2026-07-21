import type { APIRoute } from 'astro';
import { getData } from '@/lib/server/data';
import { getSession } from '@/lib/server/session';
import {
  postCartRequestToWebhook,
  type BuyerOrgType,
  type DeliveryMethod,
  type CartRequestWebhookPayload,
} from '@/lib/server/cartRequestWebhook';
import { estimateTotal, estimateVariantTotal, formatPrice, variantLabel } from '@/lib/format';
import { cartLineKey } from '@/lib/cart/types';

/** リクエストボディの1材（価格はサーバーで再計算するため識別子/qty のみ受け取る）。 */
interface ItemInput {
  listingId: string;
  variantId?: string;
  qty: number;
}

const MAX_ITEMS = 50;

/** 検証済みの購入者情報（webhook にそのまま渡せる形）。 */
type BuyerInfo = Pick<
  CartRequestWebhookPayload,
  'buyerName' | 'buyerEmail' | 'buyerOrgType' | 'buyerCompany' | 'deliveryMethod' | 'shippingAddress' | 'usage'
>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * リクエストボディから購入者情報を検証・正規化する。
 * 用途以外は必須。法人は会社名必須、配達希望は配送先（郵便番号・都道府県・市区町村）必須。
 * 不備があれば error（フォーム表示用メッセージ）を返す。
 */
function parseBuyer(payload: Record<string, unknown>): { info?: BuyerInfo; error?: string } {
  const buyerName = str(payload.buyerName);
  if (!buyerName) return { error: 'お名前を入力してください。' };

  const buyerEmail = str(payload.buyerEmail);
  // 簡易メール検証（厳密さより誤送信防止）。
  if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    return { error: 'メールアドレスを正しく入力してください。' };
  }

  const orgRaw = str(payload.buyerOrgType);
  const buyerOrgType: BuyerOrgType = orgRaw === 'corporate' ? 'corporate' : 'individual';
  let buyerCompany: string | undefined;
  if (buyerOrgType === 'corporate') {
    buyerCompany = str(payload.buyerCompany);
    if (!buyerCompany) return { error: '会社名を入力してください。' };
  }

  const delRaw = str(payload.deliveryMethod);
  if (delRaw !== 'pickup' && delRaw !== 'delivery') {
    return { error: '受け取り方法を選択してください。' };
  }
  const deliveryMethod: DeliveryMethod = delRaw;

  let shippingAddress: BuyerInfo['shippingAddress'];
  if (deliveryMethod === 'delivery') {
    const addr = (payload.shippingAddress ?? {}) as Record<string, unknown>;
    const postalCode = str(addr.postalCode);
    const prefecture = str(addr.prefecture);
    const city = str(addr.city);
    const rest = str(addr.rest);
    if (!postalCode || !prefecture || !city) {
      return { error: '配送先（郵便番号・都道府県・市区町村）を入力してください。' };
    }
    shippingAddress = { postalCode, prefecture, city, rest: rest || undefined };
  }

  const usage = str(payload.usage) || undefined;

  return {
    info: { buyerName, buyerEmail, buyerOrgType, buyerCompany, deliveryMethod, shippingAddress, usage },
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * カートのまとめ購入リクエスト。{ items: [{listingId, qty}], message? } を受け取り、
 * 採用された各材を purchase_requests に1行ずつ保存し、GAS Web App へ通知を POST する
 * （GAS 側がスプレッドシート蓄積＋運営宛メール送信を担う）。
 * 価格・数量はクライアントを信用せずサーバーで再検証・再正規化する。
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const env = locals.runtime?.env;
  const data = getData(env);
  const session = await getSession({ locals, cookies, request });
  if (!session.user) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const rawItems = payload.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return json({ error: 'items_required' }, 400);
  }
  if (rawItems.length > MAX_ITEMS) {
    return json({ error: 'too_many_items' }, 400);
  }

  // 購入者情報（用途以外は必須。法人は会社名、配達は配送先が必須）。
  const buyer = parseBuyer(payload);
  if (!buyer.info) {
    return json({ error: 'invalid_buyer', message: buyer.error }, 400);
  }

  // 行（listingId+variantId）の正規化（重複は最後の qty を採用）。
  const wanted = new Map<string, { listingId: string; variantId?: string; qty: number }>();
  for (const it of rawItems as ItemInput[]) {
    if (!it || typeof it.listingId !== 'string' || !it.listingId) {
      return json({ error: 'invalid_item' }, 400);
    }
    const variantId = typeof it.variantId === 'string' && it.variantId ? it.variantId : undefined;
    const q = Number(it.qty);
    wanted.set(cartLineKey({ listingId: it.listingId, variantId }), {
      listingId: it.listingId,
      variantId,
      qty: Number.isFinite(q) ? Math.floor(q) : 1,
    });
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : undefined;

  const created: string[] = [];
  const rejected: string[] = [];
  const mailItems: {
    title: string;
    sellerName: string;
    qty: number;
    estimatedTotal: number;
    estimatedTotalLabel: string;
  }[] = [];
  let grandTotal = 0;

  for (const [key, want] of wanted) {
    const listing = await data.getListing(want.listingId);
    if (!listing || listing.status !== 'published') {
      rejected.push(key);
      continue;
    }

    // 対象パターンを解決（sawn の複数パターン時）。指定が無ければ先頭。
    const variant =
      listing.shape === 'sawn' && listing.variants.length > 0
        ? listing.variants.find((v) => v.id === want.variantId) ?? listing.variants[0]!
        : undefined;

    // 数量: sawn は 1〜在庫（パターン在庫）、irregular は常に1。
    let qty = want.qty;
    if (listing.shape === 'irregular') {
      qty = 1;
    } else {
      const maxStock = variant ? variant.stock : listing.stock;
      qty = Math.min(Math.max(1, qty), Math.max(1, maxStock));
    }

    const estimatedTotal = variant ? estimateVariantTotal(variant, qty) : estimateTotal(listing, qty);
    grandTotal += estimatedTotal;
    const variantNote = variant ? variantLabel(variant) : undefined;

    const req = await data.createPurchaseRequest({
      listingId: listing.id,
      variantId: variant?.id,
      buyerId: session.user.id,
      qty,
      estimatedTotal,
      message: message || undefined,
    });
    created.push(req.id);

    mailItems.push({
      title: variantNote ? `${listing.title}（${variantNote}）` : listing.title,
      sellerName: listing.seller.companyName,
      qty,
      estimatedTotal,
      estimatedTotalLabel: formatPrice(estimatedTotal),
    });
  }

  if (created.length === 0) {
    return json({ error: 'no_valid_items', rejected }, 409);
  }

  // GAS Web App へ通知（スプレッドシート蓄積＋運営宛メールは GAS 側が担う）。
  // GAS_WEBHOOK_URL 未設定ならスタブログのみ（リクエスト保存は成功扱い）。
  await postCartRequestToWebhook(
    {
      // 氏名・メール等はフォーム入力（buyer.info）を正とする。buyerId はセッション。
      ...buyer.info,
      buyerId: session.user.id,
      items: mailItems,
      grandTotal,
      grandTotalLabel: formatPrice(grandTotal),
      message: message || undefined,
    },
    env
  );

  return json(
    { ok: true, created: created.length, requestIds: created, rejected, grandTotal },
    200
  );
};
