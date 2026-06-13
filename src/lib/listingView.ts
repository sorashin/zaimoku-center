import type { ListingWithSeller } from './types';
import {
  dimensionsLabel,
  formatPrice,
  priceUnitLabel,
  timeAgo,
} from './format';

/** クライアント island に渡すための、表示用に整形済みの軽量データ。 */
export interface ListingCardView {
  id: string;
  title: string;
  species: string;
  shape: 'sawn' | 'irregular';
  isSawn: boolean;
  has3d: boolean;
  stock: number;
  price: number;
  priceLabel: string;
  unitLabel: string;
  dimensionsLabel: string;
  minUnitLabel: string;
  postedLabel: string;
  mainPhoto: string;
  seller: {
    id: string;
    companyName: string;
    shortLabel: string;
    avatarColor: string;
    lat: number;
    lng: number;
  };
  /** マップピンのラベル（樹種｜¥価格/㎥） */
  pinLabel: string;
}

export function toCardView(listing: ListingWithSeller): ListingCardView {
  const isSawn = listing.shape === 'sawn';
  const unitLabel = priceUnitLabel(listing.priceUnit);
  const main = listing.photos.find((p) => p.isMain) ?? listing.photos[0];
  // 3Dモデルがある出品はそのプレビュー画像を1枚目（サムネ）に。無ければ写真1枚目。
  const thumbnail = listing.modelPosterUrl ?? main?.url ?? '';
  return {
    id: listing.id,
    title: listing.title,
    species: listing.species,
    shape: listing.shape,
    isSawn,
    has3d: Boolean(listing.modelUrl),
    stock: listing.stock,
    price: listing.price,
    priceLabel: formatPrice(listing.price),
    unitLabel,
    dimensionsLabel: dimensionsLabel(listing),
    minUnitLabel: listing.minUnitLabel,
    postedLabel: `${timeAgo(listing.postedAt)}出品`,
    mainPhoto: thumbnail,
    seller: {
      id: listing.seller.id,
      companyName: listing.seller.companyName,
      shortLabel: listing.seller.shortLabel,
      avatarColor: listing.seller.avatarColor,
      lat: listing.seller.lat,
      lng: listing.seller.lng,
    },
    pinLabel: `${listing.species}｜${formatPrice(listing.price)}${unitLabel}`,
  };
}
