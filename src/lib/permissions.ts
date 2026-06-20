import type { Listing, ListingWithSeller, SessionUser } from './types';

/**
 * 出品を編集できるか。
 * - admin: すべての出品を編集可
 * - seller: 自分が出品したもの（listing.sellerId === 自分の sellerId）のみ編集可
 * - それ以外: 不可
 *
 * 権限ロジックはこの1関数に集約する。Admin属性の追加・拡張時もここだけ変更する。
 * フロント（編集ボタン表示）／バックエンド（編集API・編集ページ）の両方で必ずこれを使う。
 */
export function canEditListing(
  user: SessionUser | null | undefined,
  listing: Pick<Listing | ListingWithSeller, 'sellerId'>,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'seller' && user.sellerProfile?.sellerId) {
    return listing.sellerId === user.sellerProfile.sellerId;
  }
  return false;
}

/** すべての出品を横断管理できるか（出品管理の全件表示など）。admin のみ。 */
export function isAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * 出品の作成・メディアアップロードなど「出品まわりの操作」ができるか。
 * seller（自分の出品向け）または admin（横断管理・他人の出品の編集向け）。
 * メディアアップロードAPIや新規出品の権限ゲートに使う。
 */
export function canManageListings(user: SessionUser | null | undefined): boolean {
  return user?.role === 'seller' || user?.role === 'admin';
}
