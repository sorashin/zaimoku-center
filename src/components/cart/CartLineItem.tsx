import type { CartItem } from '@/lib/cart/types';
import { cartLineKey } from '@/lib/cart/types';
import { estimateLineTotal, formatYen } from '@/lib/cart/estimate';
import { onImgError, PLACEHOLDER_IMAGE } from '@/lib/image';

interface Props {
  item: CartItem;
  /** key は cartLineKey（listingId+variantId）。 */
  onQtyChange: (lineKey: string, qty: number) => void;
  /** key は cartLineKey（listingId+variantId）。 */
  onRemove: (lineKey: string) => void;
}

/** カートドロワーの1行（写真・タイトル・パターン・単価・数量ステッパー・小計・削除）。 */
export function CartLineItem({ item, onQtyChange, onRemove }: Props) {
  const isSawn = item.shape === 'sawn';
  const subtotal = estimateLineTotal(item);
  const lineKey = cartLineKey(item);

  return (
    <div className="flex gap-3 border-b border-hairline py-4">
      <img
        src={item.photo || PLACEHOLDER_IMAGE}
        alt=""
        onError={onImgError}
        className="h-16 w-16 flex-shrink-0 rounded-[10px] object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">
            {item.title}
          </span>
          <button
            type="button"
            onClick={() => onRemove(lineKey)}
            aria-label="カートから削除"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-pill border-none bg-transparent text-ink-sub transition-colors hover:bg-surface-muted"
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path
                d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <span className="text-[12px] text-ink-sub">{item.sellerName}</span>
        {(item.variantLabel || item.dimensionLabel) && (
          <span className="inline-flex w-fit rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-sub">
            {item.variantLabel || item.dimensionLabel}
          </span>
        )}

        <div className="mt-1 flex items-center justify-between">
          {isSawn ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="減らす"
                onClick={() => onQtyChange(lineKey, item.qty - 1)}
                disabled={item.qty <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-strong bg-surface text-[16px] text-ink disabled:opacity-35"
              >
                −
              </button>
              <span className="w-9 text-center text-[15px] font-semibold">{item.qty}</span>
              <button
                type="button"
                aria-label="増やす"
                onClick={() => onQtyChange(lineKey, item.qty + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-pill border border-border-strong bg-surface text-[16px] text-ink"
              >
                ＋
              </button>
            </span>
          ) : (
            <span className="text-[12px] text-ink-sub">一点物・1点</span>
          )}
          <span className="text-[15px] font-bold">{formatYen(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}
