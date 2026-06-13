import type {
  Listing,
  ListingFilter,
  ListingSort,
  ListingWithSeller,
  PurchaseRequest,
  Seller,
} from '@/lib/types';

/** 新規出品の入力（id / postedAt はストア側で採番） */
export type CreateListingInput = Omit<Listing, 'id' | 'postedAt'>;

/** 出品の部分更新 */
export type UpdateListingInput = Partial<Omit<Listing, 'id' | 'postedAt' | 'sellerId'>>;

/** 購入リクエストの入力（id / status / createdAt はストア側で付与） */
export type CreatePurchaseRequestInput = Omit<
  PurchaseRequest,
  'id' | 'status' | 'createdAt'
>;

/** データ層の共通インターフェース（mock / supabase で実装を切り替え） */
export interface DataLayer {
  getSellers(): Promise<Seller[]>;
  getSeller(id: string): Promise<Seller | null>;

  getListings(filter?: ListingFilter, sort?: ListingSort): Promise<ListingWithSeller[]>;
  getListing(id: string): Promise<ListingWithSeller | null>;
  /** 出品者の出品一覧。includeAll=true で公開停止/売切れも含む（管理画面用）。 */
  getSellerListings(sellerId: string, includeAll?: boolean): Promise<ListingWithSeller[]>;
  getRelatedListings(listing: Listing, limit?: number): Promise<ListingWithSeller[]>;

  createListing(input: CreateListingInput): Promise<ListingWithSeller>;
  updateListing(id: string, patch: UpdateListingInput): Promise<ListingWithSeller | null>;
  deleteListing(id: string): Promise<boolean>;

  toggleFavorite(userId: string, listingId: string): Promise<boolean>;
  getFavoriteIds(userId: string): Promise<string[]>;
  getFavoriteListings(userId: string): Promise<ListingWithSeller[]>;

  createPurchaseRequest(input: CreatePurchaseRequestInput): Promise<PurchaseRequest>;
}
