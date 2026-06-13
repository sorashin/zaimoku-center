// ===== ドメイン型 =====

export type Shape = 'sawn' | 'irregular';
export type ListingStatus = 'published' | 'closed' | 'sold';
export type PriceUnit = 'per_m3' | 'per_item';
export type ModelFormat = 'glb' | 'splat';
export type UserRole = 'buyer' | 'seller' | 'admin';

/** 出品者（材木屋・製材所・森林組合） */
export interface Seller {
  id: string;
  companyName: string;
  /** 丸アイコン用の短いラベル（2文字程度） */
  shortLabel: string;
  /** 丸アイコンの背景色 */
  avatarColor: string;
  /** 所在地表記（例: 長野県伊那市） */
  locationLabel: string;
  lat: number;
  lng: number;
  /** 出品者紹介（任意） */
  bio?: string;
}

/** 出品商品 */
export interface Listing {
  id: string;
  sellerId: string;
  title: string;
  species: string;
  shape: Shape;

  // 寸法（sawn のみ・mm）
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;

  stock: number;
  price: number;
  priceUnit: PriceUnit;
  /** 最小取引単位バッジ（例: 1本からOK） */
  minUnitLabel: string;
  status: ListingStatus;

  description?: string;

  // 質感メタ（すべて任意）
  moisture?: string; // 含水率
  dryness?: string; // 乾燥状態
  heartwood?: string; // 赤身/白太
  knots?: string; // 節の状態

  // 3Dモデル（任意）
  modelUrl?: string;
  modelFormat?: ModelFormat;
  /** 3Dモデルのプレビュー画像（一覧サムネ等に使用）。無ければ写真1枚目を使う */
  modelPosterUrl?: string;

  photos: ListingPhoto[];
  /** ISO日時。表示は相対表記に変換 */
  postedAt: string;
}

export interface ListingPhoto {
  url: string;
  isMain: boolean;
}

/** 購入リクエスト */
export interface PurchaseRequest {
  id: string;
  listingId: string;
  buyerId: string;
  qty: number;
  estimatedTotal: number;
  message?: string;
  status: 'open' | 'closed';
  createdAt: string;
}

// ===== セッション =====

export interface SellerProfile {
  sellerId: string;
}

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
  /** seller ロールのみ保持 */
  sellerProfile?: SellerProfile;
}

export interface Session {
  user: SessionUser | null;
}

// ===== 一覧の絞り込み・並び替え =====

export interface ListingFilter {
  /** タイトル・樹種のテキスト検索（サーバー側では未使用。クライアント絞込用） */
  query?: string;
  /** 製材済みのみ */
  sawnOnly?: boolean;
  /** 不定形材のみ */
  irregularOnly?: boolean;
  /** 出品者で絞り込み */
  sellerId?: string;
  /** ステータス（既定: published のみ） */
  status?: ListingStatus;
}

export type ListingSort = 'newest' | 'price_asc';

/** 出品者情報を結合した一覧表示用の型 */
export interface ListingWithSeller extends Listing {
  seller: Seller;
}
