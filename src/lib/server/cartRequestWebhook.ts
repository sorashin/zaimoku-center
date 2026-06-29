// カートまとめ購入リクエストの通知を Google Apps Script の Web App へ POST する。
// GAS 側がスプレッドシートへの蓄積と運営宛メール送信を担う（Resend・ドメイン認証不要）。
// 宛先メールやシートIDは GAS のスクリプトプロパティで管理するため、ここでは送らない。

/** GAS Web App に送るペイロード（1リクエスト＝複数材）。 */
export interface CartRequestWebhookPayload {
  /** 買い手の表示名 */
  buyerName: string;
  /** 買い手ID（Supabase の purchase_requests と突き合わせ用） */
  buyerId: string;
  /** まとめ対象の各材 */
  items: {
    title: string;
    sellerName: string;
    qty: number;
    estimatedTotal: number;
    estimatedTotalLabel: string;
  }[];
  /** 概算合計（円） */
  grandTotal: number;
  /** 概算合計（整形済み） */
  grandTotalLabel: string;
  /** 買い手からのメッセージ（任意） */
  message?: string;
}

/**
 * GAS Web App へ購入リクエストを POST する。
 * GAS_WEBHOOK_URL 未設定時は console.log スタブで内容を出力する（実送信しない）。
 * 通知失敗はリクエスト保存を妨げないため、例外は投げずログのみ。
 *
 * @param env Cloudflare runtime env。GAS_WEBHOOK_URL は runtime env からのみ読む。
 */
export async function postCartRequestToWebhook(
  payload: CartRequestWebhookPayload,
  env?: Record<string, string | undefined>
): Promise<void> {
  const url = env?.GAS_WEBHOOK_URL;
  // GAS Web App への簡易認証用の共有トークン（任意。GAS 側で照合する）。
  const token = env?.GAS_WEBHOOK_TOKEN;

  if (!url) {
    console.log('[cart-webhook:stub] まとめ購入リクエスト通知（GAS_WEBHOOK_URL 未設定）');
    console.log(`  buyer: ${payload.buyerName} (${payload.buyerId})`);
    console.log(`  items: ${payload.items.length} 件 / 合計 ${payload.grandTotalLabel}`);
    payload.items.forEach((it, i) => {
      console.log(`   ${i + 1}. ${it.title} ×${it.qty}（${it.sellerName}） ${it.estimatedTotalLabel}`);
    });
    if (payload.message) console.log(`  message: ${payload.message}`);
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // GAS の doPost は token をボディで受け取り照合する（ヘッダはGASに渡りづらいため）。
      body: JSON.stringify({ token, ...payload }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[cart-webhook] GAS 送信失敗 (${res.status}): ${detail}`);
    }
  } catch (err) {
    console.error('[cart-webhook] GAS 送信中にエラー:', err);
  }
}
