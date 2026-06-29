import { useEffect, useState } from 'react';
import type { DetailView, VariantView } from '@/lib/detailView';
import { onImgError, PLACEHOLDER_IMAGE } from '@/lib/image';
import { useCart } from '@/lib/cart/useCart';
import { openCart } from '@/lib/cart/store';
import { estimateAmount, formatPrice } from '@/lib/format';
import { VARIANT_SELECT_EVENT, type VariantSelectDetail } from './VariantPicker';

interface Props {
  detail: DetailView;
  /** 編集権限がある（自分の出品 or admin）。trueなら購入CTAを「編集する」に置換 */
  canEdit?: boolean;
  /** 編集ページへのリンク（canEdit時に使用） */
  editHref?: string;
  /** mobile=fixed下部ActionBar / desktop=右パネルCTAカード。各instanceが独立にシートを持つ。 */
  layout?: 'mobile' | 'desktop';
}

/**
 * 商品詳細のカート追加CTA。モバイルは sticky 下部バー、デスクトップ(≥1024px)は右パネルCTAカードを
 * トリガーにボトムシートを開く。数量ステッパー・概算を確認して「カートに追加」。
 * 追加は localStorage のカートに対して行い、ログイン不要。購入リクエストはカートからまとめて送る。
 */
export function RequestSheet({
  detail,
  canEdit = false,
  editHref,
  layout = 'mobile',
}: Props) {
  const { addItem } = useCart();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [qty, setQty] = useState(1);

  const isSawn = detail.isSawn;
  const hasVariants = isSawn && detail.variants.length > 0;

  // 選択中パターン。VariantPicker（写真下の island）の選択を CustomEvent で受け取る。
  // 初期値は先頭パターン。パターンが無い出品（irregular 等）では undefined。
  const [selectedVariant, setSelectedVariant] = useState<VariantView | undefined>(
    hasVariants ? detail.variants[0] : undefined
  );

  useEffect(() => {
    if (!hasVariants) return;
    const onSelect = (e: Event) => {
      const detailEv = (e as CustomEvent<VariantSelectDetail>).detail;
      if (!detailEv || detailEv.listingId !== detail.id) return;
      const v = detail.variants.find((x) => x.id === detailEv.variantId);
      if (v) setSelectedVariant(v);
    };
    window.addEventListener(VARIANT_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(VARIANT_SELECT_EVENT, onSelect);
  }, [detail.id, detail.variants, hasVariants]);

  // 価格・在庫・材積の参照元。選択パターンがあればそれを、無ければ listing 全体を使う。
  // VariantView と DetailView は price/priceUnit/unitLabel/priceLabel/volumePerUnit/stock/stockLine を共通で持つ。
  const active = selectedVariant ?? detail;
  const maxQty = Math.max(1, active.stock);

  // 概算金額
  const estimate = estimateAmount(active.priceUnit, active.price, active.volumePerUnit, qty);
  const volLine = isSawn ? `${active.volumePerUnit.toFixed(4)} ㎥/本 × ${qty} 本` : '';

  const openSheet = () => {
    setSent(false);
    setQty(1);
    setOpen(true);
  };
  const closeSheet = () => setOpen(false);

  function addToCart() {
    addItem({
      listingId: detail.id,
      variantId: selectedVariant?.id,
      variantLabel: selectedVariant?.label,
      // パターン未選択（単一 sawn）の寸法。variantLabel がある時は重複するので渡さない。
      dimensionLabel: selectedVariant ? undefined : detail.dimensionLabel || undefined,
      qty: isSawn ? Math.min(qty, maxQty) : 1,
      title: detail.title,
      photo: detail.mainPhoto,
      price: active.price,
      priceUnit: active.priceUnit,
      shape: detail.shape,
      volumePerUnit: active.volumePerUnit,
      sellerName: detail.seller.companyName,
      addedAt: Date.now(),
    });
    setSent(true);
  }

  return (
    <>
      {layout === 'mobile' ? (
        /* ===== モバイル: fixed 下部 ActionBar（常時表示） ===== */
        <div
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3.5 border-t border-hairline bg-surface px-4 py-3.5 lg:hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-bold">
              {active.priceLabel}
              {active.unitLabel && (
                <span className="text-[13px] font-normal text-ink-sub">{active.unitLabel}</span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-sub">{active.stockLine}</div>
          </div>
          {canEdit ? (
            <a
              href={editHref}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-btn border border-ink bg-surface px-6 py-3.5 text-[16px] font-bold text-ink no-underline transition-colors hover:bg-surface-muted"
            >
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M12.5 2.8l2.7 2.7-8.4 8.4-3.3.6.6-3.3 8.4-8.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              編集する
            </a>
          ) : (
            <button
              type="button"
              onClick={openSheet}
              className="whitespace-nowrap rounded-btn bg-primary px-6 py-3.5 text-[16px] font-bold text-ink transition-colors hover:bg-primary-active"
            >
              カートに追加
            </button>
          )}
        </div>
      ) : (
        /* ===== デスクトップ: 右パネル CTAカード ===== */
        <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
          <div className="text-[22px] font-bold">
            {active.priceLabel}
            {active.unitLabel && (
              <span className="text-[14px] font-normal text-ink-sub">{active.unitLabel}</span>
            )}
          </div>
          <div className="mt-1 text-[13px] text-ink-sub">{active.stockLine}</div>
          <div className="mt-1 text-[13px] text-ink-sub">{detail.minUnitLabel}</div>
          {canEdit ? (
            <>
              <a
                href={editHref}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-btn border border-ink bg-surface py-3.5 text-[16px] font-bold text-ink no-underline transition-colors hover:bg-surface-muted"
              >
                <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M12.5 2.8l2.7 2.7-8.4 8.4-3.3.6.6-3.3 8.4-8.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
                編集する
              </a>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-sub">
                この出品はあなたが編集できます。内容・在庫・価格を更新できます。
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={openSheet}
                className="mt-4 w-full rounded-btn bg-primary py-3.5 text-[16px] font-bold text-ink transition-colors hover:bg-primary-active"
              >
                カートに追加
              </button>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-sub">
                カートに入れて、他の材とまとめて購入リクエストを送れます。送信時点では支払いは発生しません。
              </p>
            </>
          )}
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
                  <span className="text-[18px] font-semibold">カートに追加</span>
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
                    {selectedVariant && (
                      <span className="text-[12px] text-ink-sub">{selectedVariant.label}</span>
                    )}
                    <span className="text-[13px] text-ink-sub">
                      {active.priceLabel}
                      {active.unitLabel} ・ {detail.seller.companyName}
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
                  <span className="text-[20px] font-bold">{formatPrice(estimate)}</span>
                </div>

                <p className="mt-2.5 text-[12px] leading-relaxed text-ink-sub">
                  カートに入れて、他の材とまとめて購入リクエストを送れます。
                </p>

                <button
                  type="button"
                  onClick={addToCart}
                  className="mt-4.5 h-[50px] w-full rounded-btn bg-primary text-[16px] font-bold text-ink transition-colors hover:bg-primary-active"
                >
                  カートに入れる
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
                <span className="mt-4 text-[18px] font-semibold">カートに追加しました</span>
                <span className="mt-2 text-[14px] leading-relaxed text-ink-sub">
                  他の材とまとめて購入リクエストを
                  <br />
                  送れます。
                </span>
                <button
                  type="button"
                  onClick={() => {
                    closeSheet();
                    openCart();
                  }}
                  className="mt-5.5 h-[50px] w-full rounded-btn bg-primary text-[16px] font-bold text-ink transition-colors hover:bg-primary-active"
                >
                  カートを見る
                </button>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="mt-3 h-[50px] w-full rounded-btn border border-ink bg-surface text-[16px] font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  買い物を続ける
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
