// メール通知。RESEND_API_KEY があれば Resend HTTP API へ fetch、無ければ console.log スタブ。

export interface PurchaseRequestMail {
  /** 宛先（出品者） */
  to: string;
  sellerName: string;
  /** 品目名 */
  listingTitle: string;
  /** 数量（本/点） */
  qty: number;
  /** 概算金額（整形済み文字列） */
  estimatedTotalLabel: string;
  /** 買い手の表示名 */
  buyerName: string;
  /** 買い手の連絡先（mock では未取得のため任意） */
  buyerContact?: string;
  /** 買い手からのメッセージ（任意） */
  message?: string;
}

/** カートまとめ購入リクエストの通知（運営宛、複数材を1通に集約）。 */
export interface CartRequestMail {
  /**
   * 宛先（運営アドレス = ADMIN_NOTIFY_EMAIL）。
   * カンマ/セミコロン/空白区切りの文字列、または配列で複数指定できる。
   */
  to: string | string[];
  /** 買い手の表示名 */
  buyerName: string;
  /** 買い手の連絡先（任意） */
  buyerContact?: string;
  /** まとめ対象の各材 */
  items: {
    title: string;
    sellerName: string;
    qty: number;
    estimatedTotalLabel: string;
  }[];
  /** 概算合計（整形済み） */
  grandTotalLabel: string;
  /** 買い手からのメッセージ（任意） */
  message?: string;
}

/** 宛先を配列に正規化する。文字列はカンマ/セミコロン/空白区切りで複数指定可。 */
function toRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : to.split(/[,;\s]+/);
  return list.map((s) => s.trim()).filter(Boolean);
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
// 宛先ドメイン未設定のため、当面は Resend の検証用送信元を既定にする。
const FROM_ADDRESS = '伊那材木センター <onboarding@resend.dev>';

function buildBody(mail: PurchaseRequestMail): string {
  const lines = [
    `${mail.sellerName} 御中`,
    '',
    '伊那材木センターに購入リクエストが届きました。',
    '',
    `■ 品目: ${mail.listingTitle}`,
    `■ 数量: ${mail.qty}`,
    `■ 概算金額: ${mail.estimatedTotalLabel}`,
    '',
    '【買い手の連絡先】',
    `氏名: ${mail.buyerName}`,
    `連絡先: ${mail.buyerContact ?? '（未登録 — マイページの連絡先をご確認ください）'}`,
  ];
  if (mail.message) {
    lines.push('', '【メッセージ】', mail.message);
  }
  lines.push(
    '',
    'このメールに返信する形で、買い手へ直接ご連絡ください。',
    '— 伊那材木センター'
  );
  return lines.join('\n');
}

/**
 * 購入リクエストを出品者へメール通知する。
 * RESEND_API_KEY 未設定時は console.log スタブで内容を出力する。
 *
 * @param env Cloudflare runtime env（Astro.locals.runtime.env）。RESEND_API_KEY は秘匿値のため
 *   import.meta.env フォールバックは使わず runtime env からのみ読む（バンドル焼き込み防止）。
 *   ローカル dev でも platformProxy 経由で .env 値が runtime env に入る。
 */
export async function sendPurchaseRequestMail(
  mail: PurchaseRequestMail,
  env?: Record<string, string | undefined>
): Promise<void> {
  const apiKey = env?.RESEND_API_KEY;
  const subject = `【購入リクエスト】${mail.listingTitle}（${mail.buyerName} 様より）`;
  const body = buildBody(mail);

  if (!apiKey || apiKey === 'your-resend-api-key') {
    // スタブ: 実送信せずログ出力。
    console.log('[email:stub] 購入リクエスト通知（RESEND_API_KEY 未設定）');
    console.log(`  to: ${mail.to}`);
    console.log(`  subject: ${subject}`);
    console.log(body.split('\n').map((l) => `  | ${l}`).join('\n'));
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [mail.to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[email] Resend 送信失敗 (${res.status}): ${detail}`);
    }
  } catch (err) {
    // 通知失敗はリクエスト保存を妨げないため、ログのみ。
    console.error('[email] Resend 送信中にエラー:', err);
  }
}

function buildCartBody(mail: CartRequestMail): string {
  const lines = [
    '運営御中',
    '',
    '伊那材木センターに複数材のまとめ購入リクエストが届きました。',
    '購入希望者と各出品者の間の調整をお願いします。',
    '',
    `■ 品目数: ${mail.items.length} 件`,
  ];
  mail.items.forEach((it, i) => {
    lines.push(
      '',
      `${i + 1}. ${it.title}`,
      `   出品者: ${it.sellerName}`,
      `   数量: ${it.qty}`,
      `   概算金額: ${it.estimatedTotalLabel}`
    );
  });
  lines.push(
    '',
    `■ 概算合計: ${mail.grandTotalLabel}`,
    '',
    '【購入希望者の連絡先】',
    `氏名: ${mail.buyerName}`,
    `連絡先: ${mail.buyerContact ?? '（未登録 — 管理画面の購入リクエストをご確認ください）'}`
  );
  if (mail.message) {
    lines.push('', '【メッセージ】', mail.message);
  }
  lines.push('', '— 伊那材木センター（自動送信）');
  return lines.join('\n');
}

/**
 * カートのまとめ購入リクエストを運営へメール通知する（複数材を1通に集約）。
 * RESEND_API_KEY 未設定時は console.log スタブで内容を出力する。
 *
 * @param env Cloudflare runtime env。RESEND_API_KEY は秘匿値のため runtime env からのみ読む。
 */
export async function sendCartRequestMail(
  mail: CartRequestMail,
  env?: Record<string, string | undefined>
): Promise<void> {
  const apiKey = env?.RESEND_API_KEY;
  const subject = `【まとめ購入リクエスト】${mail.buyerName} 様より ${mail.items.length}件`;
  const body = buildCartBody(mail);
  const recipients = toRecipients(mail.to);

  if (recipients.length === 0) {
    console.error('[email] まとめ購入リクエスト: 宛先が空です（ADMIN_NOTIFY_EMAIL 未設定）');
    return;
  }

  if (!apiKey || apiKey === 'your-resend-api-key') {
    console.log('[email:stub] まとめ購入リクエスト通知（RESEND_API_KEY 未設定）');
    console.log(`  to: ${recipients.join(', ')}`);
    console.log(`  subject: ${subject}`);
    console.log(body.split('\n').map((l) => `  | ${l}`).join('\n'));
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: recipients,
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[email] Resend 送信失敗 (${res.status}): ${detail}`);
    }
  } catch (err) {
    console.error('[email] Resend 送信中にエラー:', err);
  }
}
