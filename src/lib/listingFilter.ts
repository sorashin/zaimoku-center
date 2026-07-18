// 一覧の絞り込み条件（サイズ範囲・形状・樹種分類）と、それをカードに適用する純粋関数。
// ListBrowser（クライアント島）と絞り込みダイアログの双方から使う。

import type { ListingCardView } from './listingView';
import type { WoodClassFilter } from './species';

/** 形状フィルタ。'all'=すべて / 'sawn'=製材済み / 'irregular'=一点モノ。 */
export type ShapeFilter = 'all' | 'sawn' | 'irregular';

/** サイズの MIN/MAX（mm）。未指定は null（下限/上限なし）。 */
export interface SizeBound {
  min: number | null;
  max: number | null;
}

export interface FilterState {
  length: SizeBound;
  width: SizeBound;
  thickness: SizeBound;
  shape: ShapeFilter;
  woodClass: WoodClassFilter;
}

export const EMPTY_FILTER: FilterState = {
  length: { min: null, max: null },
  width: { min: null, max: null },
  thickness: { min: null, max: null },
  shape: 'all',
  woodClass: 'all',
};

/** サイズ範囲 [lo, hi] が指定境界 bound と重なるか（いずれかのパターンが条件を満たせばヒット）。 */
function overlaps(lo: number, hi: number, bound: SizeBound): boolean {
  if (bound.min != null && hi < bound.min) return false;
  if (bound.max != null && lo > bound.max) return false;
  return true;
}

/** サイズ境界が1つでも指定されているか。 */
function hasSizeBound(b: SizeBound): boolean {
  return b.min != null || b.max != null;
}

/** カード1件がフィルタ条件を満たすか。 */
export function matchesFilter(item: ListingCardView, f: FilterState): boolean {
  // 形状・樹種分類（all は素通り、未分類は conifer/broadleaf 指定時に除外）
  if (f.shape !== 'all' && item.shape !== f.shape) return false;
  if (f.woodClass !== 'all' && item.woodClass !== f.woodClass) return false;

  // サイズ（いずれかの寸法境界が指定されている時のみ判定）
  const sizeSpecified =
    hasSizeBound(f.length) || hasSizeBound(f.width) || hasSizeBound(f.thickness);
  if (sizeSpecified) {
    // irregular は寸法を持たないため、サイズ指定時は対象外にする。
    const r = item.sizeRange;
    if (!r) return false;
    if (!overlaps(r.lengthMin, r.lengthMax, f.length)) return false;
    if (!overlaps(r.widthMin, r.widthMax, f.width)) return false;
    if (!overlaps(r.thicknessMin, r.thicknessMax, f.thickness)) return false;
  }

  return true;
}

/** スライダーの取りうる範囲（各寸法の全出品を通じた最小・最大, mm）。 */
export interface SizeDomain {
  length: { min: number; max: number };
  width: { min: number; max: number };
  thickness: { min: number; max: number };
}

/** 全カードから各寸法の実測レンジ（スライダー端）を求める。寸法を持つ出品が無ければ 0〜0。 */
export function sizeDomainFromItems(items: ListingCardView[]): SizeDomain {
  const acc = {
    length: { min: Infinity, max: -Infinity },
    width: { min: Infinity, max: -Infinity },
    thickness: { min: Infinity, max: -Infinity },
  };
  for (const it of items) {
    const r = it.sizeRange;
    if (!r) continue;
    acc.length.min = Math.min(acc.length.min, r.lengthMin);
    acc.length.max = Math.max(acc.length.max, r.lengthMax);
    acc.width.min = Math.min(acc.width.min, r.widthMin);
    acc.width.max = Math.max(acc.width.max, r.widthMax);
    acc.thickness.min = Math.min(acc.thickness.min, r.thicknessMin);
    acc.thickness.max = Math.max(acc.thickness.max, r.thicknessMax);
  }
  const norm = (d: { min: number; max: number }) =>
    Number.isFinite(d.min) && Number.isFinite(d.max) ? d : { min: 0, max: 0 };
  return { length: norm(acc.length), width: norm(acc.width), thickness: norm(acc.thickness) };
}

/** 有効な（デフォルトでない）絞り込み条件の数。ボタンのバッジ表示に使う。 */
export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (hasSizeBound(f.length)) n++;
  if (hasSizeBound(f.width)) n++;
  if (hasSizeBound(f.thickness)) n++;
  if (f.shape !== 'all') n++;
  if (f.woodClass !== 'all') n++;
  return n;
}
