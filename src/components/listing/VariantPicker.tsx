import { useEffect, useState } from 'react';
import type { VariantView } from '@/lib/detailView';

/**
 * 詳細画面の寸法・在庫・価格パターン選択（チップUI）。
 * 写真・タイトルの下に独立した island として置き、選択を window CustomEvent で
 * RequestSheet（mobile/desktop の2インスタンス）へ配信する。状態管理ライブラリ非依存。
 */

/** パターン選択の配信イベント名。VariantPicker → RequestSheet の片方向通知。 */
export const VARIANT_SELECT_EVENT = 'zaimoku:variant-select';

export interface VariantSelectDetail {
  listingId: string;
  variantId: string;
}

/** 選択中 variantId を window イベントで配信する。 */
export function emitVariantSelect(listingId: string, variantId: string): void {
  window.dispatchEvent(
    new CustomEvent<VariantSelectDetail>(VARIANT_SELECT_EVENT, {
      detail: { listingId, variantId },
    })
  );
}

interface Props {
  listingId: string;
  variants: VariantView[];
}

export function VariantPicker({ listingId, variants }: Props) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? '');

  // マウント時に初期選択を配信（RequestSheet が初期値を拾えるよう）。
  useEffect(() => {
    if (selectedId) emitVariantSelect(listingId, selectedId);
    // listingId / 初期 selectedId 固定のため一度だけ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (variants.length === 0) return null;

  const select = (id: string) => {
    setSelectedId(id);
    emitVariantSelect(listingId, id);
  };

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0]!;

  return (
    <div className="px-4 pt-5 md:px-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold">寸法・パターンを選択</h2>
        <span className="text-[13px] text-ink-sub">{variants.length} パターン</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const active = v.id === selectedId;
          const soldOut = v.stock <= 0;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => !soldOut && select(v.id)}
              disabled={soldOut}
              aria-pressed={active}
              className={`flex flex-col items-start gap-0.5 rounded-btn border px-3.5 py-2.5 text-left transition-colors ${
                active
                  ? 'border-ink bg-ink text-surface'
                  : 'border-border-strong bg-surface text-ink hover:bg-surface-muted'
              } ${soldOut ? 'cursor-not-allowed opacity-45' : ''}`}
            >
              <span className="text-[14px] font-semibold">{v.label}</span>
              <span className={`text-[12px] ${active ? 'text-surface/80' : 'text-ink-sub'}`}>
                {v.priceLabel}
                {v.unitLabel} ・ {soldOut ? '在庫なし' : v.stockLine}
              </span>
            </button>
          );
        })}
      </div>
      {/* 選択中パターンの寸法を補足表示 */}
      <p className="mt-2.5 text-[13px] text-ink-sub">
        選択中: {selected.dimsLabel} ・ {selected.priceLabel}
        {selected.unitLabel}
      </p>
    </div>
  );
}
