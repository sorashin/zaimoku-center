import type { Listing, PriceUnit } from './types';

/** 相対表記の出品日（「3日前」「2週間前」「1か月前」） */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  const week = Math.floor(day / 7);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);

  if (sec < 60) return 'たった今';
  if (min < 60) return `${min}分前`;
  if (hour < 24) return `${hour}時間前`;
  if (day < 7) return `${day}日前`;
  if (week < 5) return `${week}週間前`;
  if (month < 12) return `${month}か月前`;
  return `${year}年前`;
}

/** 価格を ¥80,000 のように整形 */
export function formatPrice(price: number): string {
  return `¥${price.toLocaleString('ja-JP')}`;
}

/** 価格単位の表示（per_m3 → /㎥, per_item → 空文字） */
export function priceUnitLabel(unit: PriceUnit): string {
  return unit === 'per_m3' ? '/㎥' : '';
}

/** 1本あたりの材積（㎥）。寸法が無ければ 0 */
export function volumePerUnit(listing: {
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
}): number {
  const { lengthMm, widthMm, thicknessMm } = listing;
  if (!lengthMm || !widthMm || !thicknessMm) return 0;
  return (lengthMm * widthMm * thicknessMm) / 1e9;
}

/** 概算総額。per_m3 は 単価×材積×数量、per_item は 単価×数量 */
export function estimateTotal(listing: Listing, qty: number): number {
  if (listing.priceUnit === 'per_m3') {
    const vol = volumePerUnit(listing);
    return Math.round(listing.price * vol) * qty;
  }
  return listing.price * qty;
}

/** 寸法のサブラベル（製材済み: 長手/短手/厚み、不定形材: 一点物表記） */
export function dimensionsLabel(listing: Listing): string {
  if (listing.shape === 'sawn' && listing.lengthMm && listing.widthMm && listing.thicknessMm) {
    return `長手 ${listing.lengthMm.toLocaleString('ja-JP')}｜短手 ${listing.widthMm}｜厚み ${listing.thicknessMm}`;
  }
  return '不定形材・一点物';
}
