import { useSyncExternalStore } from 'react';
import * as store from './store';
import type { CartItem, CartSummary } from './types';

export interface UseCart {
  items: CartItem[];
  /** 種類数（行数） */
  count: number;
  /** 合計点数 */
  totalQty: number;
  addItem: (item: CartItem) => void;
  /** key は cartLineKey（listingId+variantId）。 */
  updateQty: (lineKey: string, qty: number) => void;
  /** key は cartLineKey（listingId+variantId）。 */
  removeItem: (lineKey: string) => void;
  clear: () => void;
}

/**
 * localStorage バックドのカートを購読する。複数アイランドで呼んでも同一ストアを共有する。
 * SSR スナップショットは空配列固定（バッジのちらつき回避）。
 */
export function useCart(): UseCart {
  const items = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
  const summary: CartSummary = useSyncExternalStore(
    store.subscribe,
    store.getSummary,
    () => EMPTY_SUMMARY
  );

  return {
    items,
    count: summary.count,
    totalQty: summary.totalQty,
    addItem: store.addItem,
    updateQty: store.updateQty,
    removeItem: store.removeItem,
    clear: store.clear,
  };
}

const EMPTY_SUMMARY: CartSummary = { count: 0, totalQty: 0 };
