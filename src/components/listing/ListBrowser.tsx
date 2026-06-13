import { useMemo, useState } from 'react';
import type { ListingCardView } from '@/lib/listingView';
import { ListingCard } from './ListingCard';
import { ListingsMap } from '../map/ListingsMap';

interface Props {
  items: ListingCardView[];
  /** SSR で解決した、お気に入り済み listingId の配列 */
  savedIds?: string[];
  /** ログイン済みか */
  loggedIn?: boolean;
}

type SortState = 'newest' | 'price_asc';

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-4 py-2.5 text-[14px] font-medium transition-colors"
      style={{
        background: active ? '#222222' : '#ffffff',
        color: active ? '#ffffff' : '#222222',
        borderColor: active ? '#222222' : 'var(--color-hairline)',
      }}
    >
      {children}
    </button>
  );
}

export function ListBrowser({ items, savedIds = [], loggedIn = false }: Props) {
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>('newest');
  const [sawnOnly, setSawnOnly] = useState(false);
  const [irregularOnly, setIrregularOnly] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // モバイル: マップオーバーレイの開閉
  const [mapOpen, setMapOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((it) => {
      if (sawnOnly && !irregularOnly && it.shape !== 'sawn') return false;
      if (irregularOnly && !sawnOnly && it.shape !== 'irregular') return false;
      if (q) {
        const hay = `${it.title} ${it.species}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === 'price_asc') {
      list = [...list].sort((a, b) => a.price - b.price);
    }
    return list;
  }, [items, query, sort, sawnOnly, irregularOnly]);

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex">
        {/* ===== 左: 検索・フィルター・カードグリッド ===== */}
        <div className="min-w-0 flex-1">
          {/* 検索ピル */}
          <div className="px-4 pt-4 md:px-6">
            <label className="flex items-center gap-2.5 rounded-pill border border-hairline bg-surface px-4 py-3 shadow-card">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5.2" stroke="#222222" strokeWidth="1.8" />
                <path d="M11 11L14.5 14.5" stroke="#222222" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="樹種やサイズで検索"
                className="w-full border-none bg-transparent text-[14px] font-medium text-ink outline-none placeholder:text-ink-faint"
              />
            </label>

            {/* フィルターチップ */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto py-3">
              <Chip active={sort === 'price_asc'} onClick={() => setSort((s) => (s === 'price_asc' ? 'newest' : 'price_asc'))}>
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
                価格安順
              </Chip>
              <Chip active={sawnOnly} onClick={() => setSawnOnly((v) => !v)}>
                製材済み
              </Chip>
              <Chip active={irregularOnly} onClick={() => setIrregularOnly((v) => !v)}>
                不定形材
              </Chip>
            </div>
          </div>

          {/* カードグリッド */}
          {filtered.length === 0 ? (
            <div className="px-4 py-20 text-center text-[14px] text-ink-sub md:px-6">
              条件に合う在庫が見つかりませんでした。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 px-4 pb-28 pt-2 sm:grid-cols-2 md:px-6 lg:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item, i) => (
                <ListingCard
                  key={item.id}
                  item={item}
                  index={i}
                  highlighted={highlightedId === item.id}
                  onHoverChange={setHighlightedId}
                  initialSaved={savedSet.has(item.id)}
                  loggedIn={loggedIn}
                />
              ))}
            </div>
          )}
        </div>

        {/* ===== 右: sticky 地図（≥1024px、1/3幅） ===== */}
        <aside className="hidden w-[34%] shrink-0 border-l border-hairline lg:block">
          <div className="sticky top-[57px] h-[calc(100vh-57px)]">
            <ListingsMap items={filtered} highlightedId={highlightedId} />
          </div>
        </aside>
      </div>

      {/* ===== モバイル: 「マップ」フローティングピル ===== */}
      {!mapOpen && (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-pill border-none bg-ink px-5 py-3.5 text-[14px] font-semibold text-white shadow-[rgba(0,0,0,0.2)_0_4px_12px_0] lg:hidden"
        >
          マップ
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M1.5 4L6 2L10 4L14.5 2V12L10 14L6 12L1.5 14V4Z"
              stroke="#ffffff"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M6 2V12M10 4V14" stroke="#ffffff" strokeWidth="1.4" />
          </svg>
        </button>
      )}

      {/* ===== モバイル: 全画面マップオーバーレイ ===== */}
      {mapOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          style={{ animation: 'overlayFadeIn 0.25s ease' }}
        >
          <ListingsMap items={filtered} />
          <button
            type="button"
            onClick={() => setMapOpen(false)}
            className="fixed bottom-6 left-1/2 z-[51] flex -translate-x-1/2 items-center gap-2 rounded-pill border-none bg-ink px-5 py-3.5 text-[14px] font-semibold text-white shadow-[rgba(0,0,0,0.2)_0_4px_12px_0]"
          >
            リスト
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 3H13M1 7H13M1 11H13" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
