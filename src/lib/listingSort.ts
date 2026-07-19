// 一覧の並び替え。ListBrowser（クライアント島）から使う純粋関数。
// 価格・樹種50音・新着の各順で ListingCardView を並べ替える。

import type { ListingCardView } from './listingView';

/** 並び替えキー。 */
export type SortKey =
  | 'newest' // 新着順（新→古）
  | 'oldest' // 新着順（古→新）
  | 'price_desc' // 価格の高い順
  | 'price_asc' // 価格の安い順
  | 'species_kana'; // 材料（樹種）50音順

/** 並び替えの選択肢（表示ラベル付き・UIの順序もこの配列に従う）。 */
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: '新着順（新→古）' },
  { value: 'oldest', label: '新着順（古→新）' },
  { value: 'price_desc', label: '価格の高い順' },
  { value: 'price_asc', label: '価格の安い順' },
  { value: 'species_kana', label: '材料（50音）順' },
];

/** 既定の並び順。 */
export const DEFAULT_SORT: SortKey = 'newest';

/** 樹種名の50音比較（ロケール ja、数字は数値順）。 */
function compareSpecies(a: ListingCardView, b: ListingCardView): number {
  return a.species.localeCompare(b.species, 'ja', { numeric: true });
}

/** postedAt（ISO）を数値化。パース不能は 0 として末尾側へ。 */
function postedTime(item: ListingCardView): number {
  const t = new Date(item.postedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * カード配列を指定キーで並べ替えた新配列を返す（元配列は変更しない）。
 * 主キーが同値のときは新着順（新→古）を副キーにして安定した表示にする。
 */
export function sortListings(items: ListingCardView[], key: SortKey): ListingCardView[] {
  const byNewest = (a: ListingCardView, b: ListingCardView) => postedTime(b) - postedTime(a);
  const list = [...items];
  switch (key) {
    case 'newest':
      return list.sort(byNewest);
    case 'oldest':
      return list.sort((a, b) => postedTime(a) - postedTime(b));
    case 'price_desc':
      return list.sort((a, b) => b.price - a.price || byNewest(a, b));
    case 'price_asc':
      return list.sort((a, b) => a.price - b.price || byNewest(a, b));
    case 'species_kana':
      return list.sort((a, b) => compareSpecies(a, b) || byNewest(a, b));
    default:
      return list;
  }
}
