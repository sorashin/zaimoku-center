import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart/useCart';
import { openCart } from '@/lib/cart/store';

/**
 * ヘッダーのカートアイコン。バッジに種類数を表示し、aria/title に点数も併記する。
 * クリックでカートドロワーを開く（CART_OPEN_EVENT を発火）。
 * SSR 初回はバッジ非表示。マウント後に localStorage の実数を反映してちらつきを防ぐ。
 */
export function CartButton() {
  const { count, totalQty } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showBadge = mounted && count > 0;
  const label = showBadge
    ? `カート（${count}種類・${totalQty}点）`
    : 'カート';

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-pill border-none bg-transparent text-ink transition-opacity hover:opacity-80"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 4h2l2.2 11.2a1.5 1.5 0 001.5 1.2h7.8a1.5 1.5 0 001.5-1.2L20.5 7H6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
        <circle cx="17" cy="20" r="1.4" fill="currentColor" />
      </svg>
      {showBadge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-primary px-1 text-[11px] font-bold leading-none text-ink">
          {count}
        </span>
      )}
    </button>
  );
}
