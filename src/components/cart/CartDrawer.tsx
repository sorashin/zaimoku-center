import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart/useCart';
import { cartLineKey } from '@/lib/cart/types';
import { CART_OPEN_EVENT } from '@/lib/cart/store';
import { estimateGrandTotal, formatYen } from '@/lib/cart/estimate';
import { CartLineItem } from './CartLineItem';

interface Props {
  loggedIn: boolean;
}

/**
 * 右からスライドインするカートドロワー。CART_OPEN_EVENT で開く。
 * 末尾の「購入リクエスト」ボタンから /api/cart-request へまとめ送信する。
 * 未ログインなら送信時に /login へ誘導。送信成功でカートをクリアし完了表示。
 */
export function CartDrawer({ loggedIn }: Props) {
  const { items, updateQty, removeItem, clear } = useCart();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // CART_OPEN_EVENT で開く。
  useEffect(() => {
    const onOpen = () => {
      setSent(false);
      setError(null);
      setRejected([]);
      setOpen(true);
    };
    window.addEventListener(CART_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CART_OPEN_EVENT, onOpen);
  }, []);

  // Escで閉じる。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const grandTotal = estimateGrandTotal(items);

  const redirectToLogin = () => {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  };

  async function submit() {
    if (!loggedIn) {
      redirectToLogin();
      return;
    }
    if (submitting || items.length === 0) return;
    setSubmitting(true);
    setError(null);
    setRejected([]);
    try {
      const res = await fetch('/api/cart-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((it) => ({
            listingId: it.listingId,
            variantId: it.variantId,
            qty: it.qty,
          })),
        }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
        throw new Error(`status ${res.status}`);
      }
      const json = (await res.json()) as { rejected?: string[] };
      // 在庫切れ等で除外された行（lineKey）のタイトルを控えてから clear。
      const rejectedTitles = (json.rejected ?? [])
        .map((key) => items.find((it) => cartLineKey(it) === key)?.title)
        .filter((t): t is string => Boolean(t));
      setRejected(rejectedTitles);
      clear();
      setSent(true);
    } catch {
      setError('送信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[70] bg-black/50"
        style={{ animation: 'overlayFadeIn 0.2s ease' }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="カート"
        className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-[420px] flex-col bg-surface"
        style={{ animation: 'drawerInRight 0.28s ease' }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <span className="text-[18px] font-semibold">カート</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="閉じる"
            className="flex h-9 w-9 items-center justify-center rounded-pill border-none bg-surface-muted"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path
                d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5"
                stroke="#222222"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* 本体 */}
        {sent ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-primary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4.5 12.5L9.5 17.5L19.5 7"
                  stroke="#222222"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="mt-4 text-[18px] font-semibold">購入リクエストを送信しました</span>
            <span className="mt-2 text-[14px] leading-relaxed text-ink-sub">
              運営が内容を確認し、1〜2営業日以内にご連絡します。
            </span>
            {rejected.length > 0 && (
              <div className="mt-4 w-full rounded-card border border-hairline bg-surface-muted px-4 py-3 text-left text-[12px] leading-relaxed text-ink-sub">
                次の品目は在庫切れ・公開終了のため除外しました：
                <br />
                {rejected.join('、')}
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 h-[50px] w-full rounded-btn border border-ink bg-surface text-[16px] font-semibold text-ink transition-colors hover:bg-surface-muted"
            >
              閉じる
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-surface-muted">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 4h2l2.2 11.2a1.5 1.5 0 001.5 1.2h7.8a1.5 1.5 0 001.5-1.2L20.5 7H6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="20" r="1.3" fill="currentColor" />
                <circle cx="17" cy="20" r="1.3" fill="currentColor" />
              </svg>
            </span>
            <span className="mt-4 text-[15px] font-medium text-ink-sub">
              カートは空です
            </span>
            <span className="mt-1 text-[13px] text-ink-faint">
              気になる材を「カートに追加」してください。
            </span>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5">
              {items.map((it) => (
                <CartLineItem
                  key={cartLineKey(it)}
                  item={it}
                  onQtyChange={updateQty}
                  onRemove={removeItem}
                />
              ))}
            </div>

            {/* フッター（合計＋送信） */}
            <div className="border-t border-hairline px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-medium">概算合計</span>
                <span className="text-[22px] font-bold">{formatYen(grandTotal)}</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-sub">
                送信時点では支払いは発生しません。運営が在庫と引き渡し方法を確認のうえ、正式な金額をご連絡します。
              </p>
              {error && <p className="mt-2 text-[13px] font-medium text-danger">{error}</p>}
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="mt-3 h-[50px] w-full rounded-btn bg-primary text-[16px] font-bold text-ink transition-colors hover:bg-primary-active disabled:opacity-60"
              >
                {loggedIn
                  ? submitting
                    ? '送信中…'
                    : '購入リクエストを送信'
                  : 'ログインして送信'}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
