import type { ListingCardView } from '@/lib/listingView';
import { FavoriteButton } from '@/components/FavoriteButton';
import { onImgError, PLACEHOLDER_IMAGE } from '@/lib/image';

interface Props {
  item: ListingCardView;
  /** フェードイン順次delay用のインデックス */
  index?: number;
  /** マップ連動: hover時のハイライト通知（デスクトップのみ・任意） */
  onHoverChange?: (id: string | null) => void;
  highlighted?: boolean;
  /** SSR で解決した初期お気に入り状態 */
  initialSaved?: boolean;
  /** ログイン済みか（未ログインのハートは /login へ誘導） */
  loggedIn?: boolean;
}

export function ListingCard({
  item,
  index = 0,
  onHoverChange,
  highlighted = false,
  initialSaved = false,
  loggedIn = false,
}: Props) {
  return (
    <a
      href={`/items/${item.id}`}
      className="group block no-underline text-ink"
      style={{
        animation: `cardFadeIn 0.4s ease both`,
        animationDelay: `${Math.min(index, 12) * 40}ms`,
      }}
      onMouseEnter={() => onHoverChange?.(item.id)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <div
        className="relative overflow-hidden rounded-card"
        style={{
          outline: highlighted ? '2px solid var(--color-primary)' : 'none',
          outlineOffset: '2px',
        }}
      >
        <img
          src={item.mainPhoto || PLACEHOLDER_IMAGE}
          alt={item.title}
          loading="lazy"
          onError={onImgError}
          className="block aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {/* ハート（楽観的トグル・/api/favorites） */}
        <FavoriteButton
          listingId={item.id}
          initialSaved={initialSaved}
          loggedIn={loggedIn}
          variant="card"
        />

        {/* 3Dバッジ */}
        {item.has3d && (
          <div className="absolute bottom-3.5 right-3.5 flex h-[38px] w-[38px] items-center justify-center rounded-pill border-[1.5px] border-white bg-black/25 text-[11px] font-bold text-white">
            3D
          </div>
        )}

        {/* 最小取引単位バッジ */}
        <div className="absolute bottom-3.5 left-3.5 rounded-pill bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm">
          {item.minUnitLabel}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold">{item.title}</span>
          {item.isSawn && (
            <span className="whitespace-nowrap text-[13px] text-ink-sub">
              在庫 <span className="text-[16px] font-semibold text-ink">{item.stock}</span> 本
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <span
              className="flex h-[26px] w-[26px] items-center justify-center rounded-pill text-[8px] font-bold leading-none text-white"
              style={{ background: item.seller.avatarColor }}
            >
              {item.seller.shortLabel}
            </span>
            <span className="text-[13px] font-medium">{item.seller.companyName}</span>
          </span>
        </div>

        <div className="mt-1 text-[13px] text-ink-sub">{item.dimensionsLabel}</div>

        <div className="mt-1.5 text-[18px] font-semibold">
          {item.priceLabel}
          {item.unitLabel && (
            <span className="text-[13px] font-normal text-ink-sub">{item.unitLabel}</span>
          )}
        </div>

        <div className="mt-1 text-[13px] text-ink-faint">{item.postedLabel}</div>
      </div>
    </a>
  );
}
