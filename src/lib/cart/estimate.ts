import type { CartItem } from './types';
import { estimateAmount, formatPrice } from '@/lib/format';

/** カート行の概算小計。表示と保存額の一致のため format.ts の estimateAmount に集約。 */
export function estimateLineTotal(item: CartItem): number {
  return estimateAmount(item.priceUnit, item.price, item.volumePerUnit, item.qty);
}

/** カート全体の概算合計。 */
export function estimateGrandTotal(items: CartItem[]): number {
  return items.reduce((sum, it) => sum + estimateLineTotal(it), 0);
}

/** 価格を ¥80,000 のように整形（format.ts の formatPrice を再エクスポート）。 */
export const formatYen = formatPrice;
