import { useState } from 'react';

type Variant = 'card' | 'detail';

interface Props {
  listingId: string;
  /** SSR で解決した初期保存状態 */
  initialSaved?: boolean;
  /** 未ログインか（true なら /login へ誘導） */
  loggedIn?: boolean;
  /** 見た目のバリエーション。card=オーバーレイ / detail=丸ボタン */
  variant?: Variant;
}

/**
 * 共通お気に入りトグル。楽観的にUIを更新し /api/favorites へ POST。
 * 未ログイン時は /login?redirect=... へ遷移する。
 */
export function FavoriteButton({
  listingId,
  initialSaved = false,
  loggedIn = false,
  variant = 'card',
}: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!loggedIn) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${redirect}`;
      return;
    }

    if (pending) return;
    const next = !saved;
    setSaved(next); // 楽観的更新
    setPending(true);
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?redirect=${redirect}`;
          return;
        }
        throw new Error(`status ${res.status}`);
      }
      const json = (await res.json()) as { saved: boolean };
      setSaved(json.saved);
    } catch {
      setSaved(!next); // ロールバック
    } finally {
      setPending(false);
    }
  }

  if (variant === 'detail') {
    return (
      <button
        type="button"
        aria-label={saved ? '保存済み' : '保存'}
        aria-pressed={saved}
        onClick={onClick}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-pill border-none bg-white shadow-[rgba(0,0,0,0.15)_0_2px_6px_0]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 21C12 21 3.5 15.5 3.5 9.5C3.5 6.5 5.8 4.5 8.3 4.5C10 4.5 11.4 5.5 12 6.6C12.6 5.5 14 4.5 15.7 4.5C18.2 4.5 20.5 6.5 20.5 9.5C20.5 15.5 12 21 12 21Z"
            fill={saved ? '#FF9F1C' : 'rgba(0,0,0,0.25)'}
            stroke={saved ? '#FF9F1C' : '#222222'}
            strokeWidth="1.8"
          />
        </svg>
      </button>
    );
  }

  // card variant: 画像オーバーレイ
  return (
    <button
      type="button"
      aria-label={saved ? '保存済み' : '保存'}
      aria-pressed={saved}
      onClick={onClick}
      className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center border-none bg-transparent p-0"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 21C12 21 3.5 15.5 3.5 9.5C3.5 6.5 5.8 4.5 8.3 4.5C10 4.5 11.4 5.5 12 6.6C12.6 5.5 14 4.5 15.7 4.5C18.2 4.5 20.5 6.5 20.5 9.5C20.5 15.5 12 21 12 21Z"
          fill={saved ? '#FF9F1C' : 'rgba(0,0,0,0.4)'}
          stroke={saved ? '#FF9F1C' : '#ffffff'}
          strokeWidth="1.8"
        />
      </svg>
    </button>
  );
}
