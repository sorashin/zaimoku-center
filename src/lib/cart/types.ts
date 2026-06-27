import type { PriceUnit } from '@/lib/types';

/**
 * カートの1行。localStorage に保存する。
 * ドロワー描画にサーバー往復を不要にするため、表示用の値をスナップショットとして持つ。
 * 価格・概算は焼き込まず、price + volumePerUnit + qty からクライアントで都度計算する
 * （価格変動時に古い値が残らないように）。最終的な正は送信時にサーバーが再検証する。
 */
export interface CartItem {
  listingId: string;
  /** 選択パターン（sawn の複数パターン時）。無ければ listing 全体。 */
  variantId?: string;
  /** パターン表示ラベル（例: 厚20×幅180×長2000）。variantId がある時の補助表示。 */
  variantLabel?: string;
  /** 寸法ラベル（sawn 単一パターン時の「2000×150×30mm」。variantLabel が無い時の表示用）。 */
  dimensionLabel?: string;
  qty: number;
  /** 表示用スナップショット */
  title: string;
  /** mainPhoto URL（空文字可、PLACEHOLDER で代替） */
  photo: string;
  /** 単価（円） */
  price: number;
  priceUnit: PriceUnit;
  shape: 'sawn' | 'irregular';
  /** sawn の概算用 1本あたり材積（㎥）。irregular は 0 */
  volumePerUnit: number;
  /** 出品者名（補助表示・将来の出品者別グルーピング用） */
  sellerName: string;
  /** 追加時刻（並び順・古いカートの掃除用） */
  addedAt: number;
}

/** カート行の一意キー。同一 listing でもパターン違いは別行として扱う。 */
export function cartLineKey(item: Pick<CartItem, 'listingId' | 'variantId'>): string {
  return item.variantId ? `${item.listingId}::${item.variantId}` : item.listingId;
}

/** カートの集計値 */
export interface CartSummary {
  /** 種類数（行数） */
  count: number;
  /** 合計点数（qty 合計） */
  totalQty: number;
}
