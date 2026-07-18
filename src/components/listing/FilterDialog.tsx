import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type FilterState,
  type ShapeFilter,
  type SizeBound,
  type SizeDomain,
  EMPTY_FILTER,
} from '@/lib/listingFilter';
import { WOOD_CLASS_LABELS, type WoodClassFilter } from '@/lib/species';
import { mmLabel } from '@/lib/format';
import { RangeSlider } from './RangeSlider';

/** layoutId: 「絞り込み」ボタンとダイアログを共有し、ボタンが拡大してUIになる演出に使う。 */
const LAYOUT_ID = 'filter-surface';

interface Props {
  open: boolean;
  /** 現在確定している絞り込み条件 */
  value: FilterState;
  /** サイズスライダーの取りうる範囲（全出品の実測レンジ） */
  sizeDomain: SizeDomain;
  /** 「この条件で表示」で確定したとき */
  onApply: (next: FilterState) => void;
  onClose: () => void;
}

const SHAPE_OPTIONS: { value: ShapeFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'sawn', label: '製材済み材' },
  { value: 'irregular', label: '一点モノ' },
];

const WOOD_OPTIONS: { value: WoodClassFilter; label: string }[] = [
  { value: 'all', label: WOOD_CLASS_LABELS.all },
  { value: 'broadleaf', label: WOOD_CLASS_LABELS.broadleaf },
  { value: 'conifer', label: WOOD_CLASS_LABELS.conifer },
];

/** 刻み: 長手は 10mm、短手/厚みは 5mm 程度に丸めて操作性を確保。 */
function stepFor(domainMax: number): number {
  if (domainMax >= 2000) return 10;
  if (domainMax >= 500) return 5;
  return 1;
}

/** サイズ1行: ラベル + 2つまみスライダー + 現在値表示（端は「指定なし」）。 */
function SizeRow({
  label,
  value,
  domain,
  onChange,
}: {
  label: string;
  value: SizeBound;
  domain: { min: number; max: number };
  onChange: (b: SizeBound) => void;
}) {
  const bound = (v: number | null) => (v == null ? '指定なし' : mmLabel(v));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-medium text-ink">{label}</span>
        <span className="text-[13px] tabular-nums text-ink-sub">
          {bound(value.min)} <span className="text-ink-faint">〜</span> {bound(value.max)}
          <span className="ml-1 text-ink-faint">mm</span>
        </span>
      </div>
      <RangeSlider
        domainMin={domain.min}
        domainMax={domain.max}
        valueMin={value.min}
        valueMax={value.max}
        step={stepFor(domain.max)}
        onChange={(min, max) => onChange({ min, max })}
      />
    </div>
  );
}

/** 択一セグメント（形状・樹種分類の共通UI）。 */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-btn border px-3 py-2.5 text-[14px] font-medium transition-colors ${
              active ? 'border-ink bg-ink text-surface' : 'border-hairline bg-surface text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterDialog({ open, value, sizeDomain, onApply, onClose }: Props) {
  // ダイアログ内はドラフト状態。開くたびに確定値で初期化する。
  const [draft, setDraft] = useState<FilterState>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // 背面スクロールを止める + Escで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          initial={{ background: 'rgba(0,0,0,0)' }}
          animate={{ background: 'rgba(0,0,0,0.35)' }}
          exit={{ background: 'rgba(0,0,0,0)' }}
          onClick={onClose}
        >
          <motion.div
            layoutId={LAYOUT_ID}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-surface shadow-[rgba(0,0,0,0.18)_0_-4px_24px_0] sm:max-w-[440px] sm:rounded-[20px]"
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h2 className="m-0 text-[17px] font-semibold">絞り込み</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="閉じる"
                className="flex h-8 w-8 items-center justify-center rounded-pill text-ink-sub hover:bg-surface-muted"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path
                    d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* 本文 */}
            <motion.div
              className="flex-1 overflow-y-auto px-5 py-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.12 } }}
              exit={{ opacity: 0 }}
            >
              {/* サイズ */}
              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink-sub">サイズ（mm）</h3>
                <div className="flex flex-col gap-4">
                  <SizeRow
                    label="長手"
                    value={draft.length}
                    domain={sizeDomain.length}
                    onChange={(length) => setDraft((d) => ({ ...d, length }))}
                  />
                  <SizeRow
                    label="短手"
                    value={draft.width}
                    domain={sizeDomain.width}
                    onChange={(width) => setDraft((d) => ({ ...d, width }))}
                  />
                  <SizeRow
                    label="厚み"
                    value={draft.thickness}
                    domain={sizeDomain.thickness}
                    onChange={(thickness) => setDraft((d) => ({ ...d, thickness }))}
                  />
                </div>
                <p className="mt-2 text-[12px] text-ink-faint">
                  ※サイズを指定すると一点モノは除外されます
                </p>
              </section>

              {/* 形状 */}
              <section className="mt-6">
                <h3 className="mb-3 text-[13px] font-semibold text-ink-sub">種別</h3>
                <Segmented
                  options={SHAPE_OPTIONS}
                  value={draft.shape}
                  onChange={(shape) => setDraft((d) => ({ ...d, shape }))}
                />
              </section>

              {/* 樹種分類 */}
              <section className="mt-6">
                <h3 className="mb-3 text-[13px] font-semibold text-ink-sub">樹種</h3>
                <Segmented
                  options={WOOD_OPTIONS}
                  value={draft.woodClass}
                  onChange={(woodClass) => setDraft((d) => ({ ...d, woodClass }))}
                />
              </section>
            </motion.div>

            {/* フッター */}
            <motion.div
              className="flex items-center gap-3 border-t border-hairline px-5 py-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.12 } }}
              exit={{ opacity: 0 }}
              style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
            >
              <button
                type="button"
                onClick={() => setDraft(EMPTY_FILTER)}
                className="rounded-btn px-4 py-3 text-[15px] font-medium text-ink-sub hover:bg-surface-muted"
              >
                クリア
              </button>
              <button
                type="button"
                onClick={() => onApply(draft)}
                className="flex-1 rounded-btn bg-primary px-4 py-3 text-[15px] font-bold text-ink transition-colors hover:bg-primary-active"
              >
                この条件で表示
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { LAYOUT_ID as FILTER_LAYOUT_ID };
