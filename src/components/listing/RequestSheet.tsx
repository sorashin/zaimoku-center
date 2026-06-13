import { useState } from 'react';
import type { DetailView } from '@/lib/detailView';
import { onImgError, PLACEHOLDER_IMAGE } from '@/lib/image';

interface Props {
  detail: DetailView;
  loggedIn: boolean;
  /** mobile=sticky下部バー / desktop=右パネルCTAカード。各instanceが独立にシートを持つ。 */
  layout?: 'mobile' | 'desktop';
}

function formatYen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`;
}

/**
 * 購入リクエスト。モバイルは sticky 下部バー、デスクトップ(≥1024px)は右パネルCTAカードを
 * トリガーにボトムシートを開く。数量ステッパー・概算・送信→完了表示。
 * 未ログインなら送信前に /login へ誘導。
 */
export function RequestSheet({ detail, loggedIn, layout = 'mobile' }: Props) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSawn = detail.isSawn;
  const maxQty = Math.max(1, detail.stock);

  // 概算金額
  const estimate = isSawn
    ? Math.round(detail.price * detail.volumePerUnit) * qty
    : detail.price;
  const volLine = isSawn
    ? `${detail.volumePerUnit.toFixed(4)} ㎥/本 × ${qty} 本`
    : '';

  const openSheet = () => {
    setSent(false);
    setQty(1);
    setError(null);
    setOpen(true);
  };
  const closeSheet = () => setOpen(false);

  const redirectToLogin = () => {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  };

  async function send() {
    if (!loggedIn) {
      redirectToLogin();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: detail.id, qty: isSawn ? qty : 1 }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
        throw new Error(`status ${res.status}`);
      }
      setSent(true);
    } catch {
      setError('送信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {layout === 'mobile' ? (
        /* ===== モバイル: sticky 下部バー ===== */
        <div className="sticky bottom-0 z-20 flex items-center gap-3.5 border-t border-hairline bg-surface px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-bold">
              {detail.priceLabel}
              {detail.unitLabel && (
                <span className="text-[13px] font-normal text-ink-sub">{detail.unitLabel}</span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-sub">{detail.stockLine}</div>
          </div>
          <button
            type="button"
            onClick={openSheet}
            className="whitespace-nowrap rounded-btn bg-primary px-6 py-3.5 text-[16px] font-bold text-ink transition-colors hover:bg-primary-active"
          >
            購入リクエスト
          </button>
        </div>
      ) : (
        /* ===== デスクトップ: 右パネル CTAカード ===== */
        <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
          <div className="text-[22px] font-bold">
            {detail.priceLabel}
            {detail.unitLabel && (
              <span className="text-[14px] font-normal text-ink-sub">{detail.unitLabel}</span>
            )}
          </div>
          <div className="mt-1 text-[13px] text-ink-sub">{detail.stockLine}</div>
          <div className="mt-1 text-[13px] text-ink-sub">{detail.minUnitLabel}</div>
          <button
            type="button"
            onClick={openSheet}
            className="mt-4 w-full rounded-btn bg-primary py-3.5 text-[16px] font-bold text-ink transition-colors hover:bg-primary-active"
          >
            購入リクエスト
          </button>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-sub">
            送信時点では支払いは発生しません。{detail.seller.companyName}が在庫と引き渡し方法を確認のうえ、正式な金額を返信します。
          </p>
        </div>
      )}

      {/* ===== ボトムシート ===== */}
      {open && (
        <>
          <div
            onClick={closeSheet}
            className="fixed inset-0 z-[70] bg-black/50"
            style={{ animation: 'overlayFadeIn 0.2s ease' }}
          />
          <div
            className="fixed bottom-0 left-1/2 z-[71] w-full max-w-[480px] -translate-x-1/2 rounded-t-[20px] bg-surface px-5 pb-8 pt-5"
            style={{ animation: 'sheetUp 0.3s ease' }}
            role="dialog"
            aria-modal="true"
          >
            {!sent ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[18px] font-semibold">購入リクエスト</span>
                  <button
                    type="button"
                    onClick={closeSheet}
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

                {/* 品目サマリー */}
                <div className="mt-3.5 flex items-center gap-2.5 border-b border-hairline pb-4.5">
                  <img
                    src={detail.mainPhoto || PLACEHOLDER_IMAGE}
                    alt=""
                    onError={onImgError}
                    className="h-10 w-10 flex-shrink-0 rounded-[10px] object-cover"
                  />
                  <span className="flex flex-col gap-px">
                    <span className="text-[15px] font-semibold">{detail.title}</span>
                    <span className="text-[13px] text-ink-sub">
                      {detail.priceLabel}
                      {detail.unitLabel} ・ {detail.seller.companyName}
                    </span>
                  </span>
                </div>

                {isSawn ? (
                  <>
                    <div className="flex items-center justify-between py-4.5">
                      <span className="text-[15px] font-medium">数量（本）</span>
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="減らす"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          className="flex h-10 w-10 items-center justify-center rounded-pill border border-border-strong bg-surface text-[18px] text-ink"
                          style={{ opacity: qty <= 1 ? 0.35 : 1 }}
                        >
                          −
                        </button>
                        <span className="w-11 text-center text-[17px] font-semibold">{qty}</span>
                        <button
                          type="button"
                          aria-label="増やす"
                          onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                          className="flex h-10 w-10 items-center justify-center rounded-pill border border-border-strong bg-surface text-[18px] text-ink"
                          style={{ opacity: qty >= maxQty ? 0.35 : 1 }}
                        >
                          ＋
                        </button>
                      </span>
                    </div>
                    <div className="flex justify-between py-1 text-[13px] text-ink-sub">
                      <span>材積</span>
                      <span>{volLine}</span>
                    </div>
                  </>
                ) : (
                  <div className="py-4.5 text-[14px] text-ink-sub">
                    一点物のため数量は 1 点です。
                  </div>
                )}

                <div className="flex items-baseline justify-between py-2.5">
                  <span className="text-[15px] font-medium">概算金額</span>
                  <span className="text-[20px] font-bold">{formatYen(estimate)}</span>
                </div>

                <p className="mt-2.5 text-[12px] leading-relaxed text-ink-sub">
                  送信時点では支払いは発生しません。{detail.seller.companyName}が在庫と引き渡し方法を確認のうえ、正式な金額を返信します。
                </p>

                {error && (
                  <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>
                )}

                <button
                  type="button"
                  onClick={send}
                  disabled={submitting}
                  className="mt-4.5 h-[50px] w-full rounded-btn bg-primary text-[16px] font-bold text-ink transition-colors hover:bg-primary-active disabled:opacity-60"
                >
                  {loggedIn
                    ? submitting
                      ? '送信中…'
                      : 'リクエストを送信'
                    : 'ログインして送信'}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center px-2 pb-1 pt-4.5 text-center">
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
                <span className="mt-4 text-[18px] font-semibold">リクエストを送信しました</span>
                <span className="mt-2 text-[14px] leading-relaxed text-ink-sub">
                  {detail.seller.companyName}から1〜2営業日以内に
                  <br />
                  返信があります。
                </span>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="mt-5.5 h-[50px] w-full rounded-btn border border-ink bg-surface text-[16px] font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
