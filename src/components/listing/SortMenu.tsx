import { useEffect, useRef, useState } from 'react';
import { type SortKey, SORT_OPTIONS, DEFAULT_SORT } from '@/lib/listingSort';

interface Props {
  value: SortKey;
  onChange: (next: SortKey) => void;
}

/**
 * 一覧の並び替えメニュー。チップを押すとドロップダウンで選択肢（価格・50音・新着）を出す。
 * 外側クリック / Esc で閉じる。既定（新着順・新→古）以外を選択中はチップをアクティブ表示。
 */
export function SortMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = value !== DEFAULT_SORT;
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];

  // 外側クリック / Esc で閉じる。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-4 py-2.5 text-[14px] font-medium transition-colors"
        style={{
          background: active ? '#222222' : '#ffffff',
          color: active ? '#ffffff' : '#222222',
          borderColor: active ? '#222222' : 'var(--color-hairline)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M4 2.5V11.5M4 11.5L1.8 9.3M4 11.5L6.2 9.3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 11.5V2.5M10 2.5L7.8 4.7M10 2.5L12.2 4.7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {active ? current.label : '並び替え'}
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[200px] overflow-hidden rounded-card border border-hairline bg-surface py-1 shadow-card"
        >
          {SORT_OPTIONS.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-surface-muted ${
                  selected ? 'font-semibold text-ink' : 'text-ink-sub'
                }`}
              >
                {o.label}
                {selected && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 7.5L5.5 10.5L11.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
