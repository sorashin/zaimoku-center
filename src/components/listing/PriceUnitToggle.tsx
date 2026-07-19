import { usePriceMode, setPriceMode } from '@/lib/priceDisplayStore';

interface Props {
  /** サイズ小（カード脇など）。既定は通常サイズ。 */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * 価格表示モードの切替トグル（立米単価 ⇄ 1枚あたり）。
 * グローバルストア（priceDisplayStore）に対して切り替え、全アイランドが同期する。
 * per_m3 かつ材積のある出品でのみ意味を持つため、呼び出し側で表示可否を判定する。
 */
export function PriceUnitToggle({ size = 'md', className = '' }: Props) {
  const mode = usePriceMode();
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]';

  const btn = (target: 'volume' | 'piece', label: string) => {
    const active = mode === target;
    return (
      <button
        type="button"
        onClick={(e) => {
          // カード全体がリンクの場合に遷移させない。
          e.preventDefault();
          e.stopPropagation();
          setPriceMode(target);
        }}
        aria-pressed={active}
        className={`rounded-pill font-semibold transition-colors ${pad} ${
          active ? 'bg-ink text-surface' : 'text-ink-sub hover:text-ink'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-pill bg-surface-muted p-0.5 ${className}`}
      role="group"
      aria-label="価格の表示単位を切り替え"
    >
      {btn('volume', '㎥単価')}
      {btn('piece', '1枚')}
    </span>
  );
}
