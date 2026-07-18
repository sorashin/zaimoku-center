import type { ListingWithSeller, PriceUnit } from './types';
import {
  canSwitchPriceUnit,
  dimensionsLabel,
  formatPrice,
  priceUnitLabel,
  timeAgo,
  volumePerUnit,
} from './format';
import { classifySpecies, type WoodClass } from './species';

/**
 * 出品のサイズ範囲（長手/短手/厚み それぞれの min/max, mm）。
 * sawn は全パターン(variants)を跨いだ範囲、irregular は寸法が無いので null。
 * サイズ絞り込みは「いずれかのパターンが条件を満たせばヒット」の判定に使う。
 */
export interface SizeRange {
  lengthMin: number;
  lengthMax: number;
  widthMin: number;
  widthMax: number;
  thicknessMin: number;
  thicknessMax: number;
}

function sizeRange(listing: ListingWithSeller): SizeRange | null {
  // sawn は各パターンの寸法から範囲を作る。パターンが空なら本体のミラー値で代替。
  const dims =
    listing.variants.length > 0
      ? listing.variants.map((v) => ({ l: v.lengthMm, w: v.widthMm, t: v.thicknessMm }))
      : listing.lengthMm && listing.widthMm && listing.thicknessMm
        ? [{ l: listing.lengthMm, w: listing.widthMm, t: listing.thicknessMm }]
        : [];
  if (dims.length === 0) return null;
  const ls = dims.map((d) => d.l);
  const ws = dims.map((d) => d.w);
  const ts = dims.map((d) => d.t);
  return {
    lengthMin: Math.min(...ls),
    lengthMax: Math.max(...ls),
    widthMin: Math.min(...ws),
    widthMax: Math.max(...ws),
    thicknessMin: Math.min(...ts),
    thicknessMax: Math.max(...ts),
  };
}

/** クライアント island に渡すための、表示用に整形済みの軽量データ。 */
export interface ListingCardView {
  id: string;
  title: string;
  species: string;
  /** 樹種の分類（針葉樹/広葉樹/未分類）。分類フィルタに使う。 */
  woodClass: WoodClass;
  shape: 'sawn' | 'irregular';
  isSawn: boolean;
  /** サイズ範囲（sawn は全パターン跨ぎ、irregular は null）。サイズ絞り込みに使う。 */
  sizeRange: SizeRange | null;
  has3d: boolean;
  stock: number;
  price: number;
  priceUnit: PriceUnit;
  /** 1本あたりの材積（㎥）。1枚あたり価格の換算に使う。寸法が無ければ 0 */
  volumePerUnit: number;
  /** 立米単価⇄1枚あたりの切り替えが可能か（per_m3 かつ材積あり）。 */
  canSwitchUnit: boolean;
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
  const volume = volumePerUnit(listing);
  const main = listing.photos.find((p) => p.isMain) ?? listing.photos[0];
  // 3Dモデルがある出品はそのプレビュー画像を1枚目（サムネ）に。無ければ写真1枚目。
  const thumbnail = listing.modelPosterUrl ?? main?.url ?? '';
  return {
    id: listing.id,
    title: listing.title,
    species: listing.species,
    woodClass: classifySpecies(listing.species),
    shape: listing.shape,
    isSawn,
    sizeRange: sizeRange(listing),
    has3d: Boolean(listing.modelUrl),
    stock: listing.stock,
    price: listing.price,
    priceUnit: listing.priceUnit,
    volumePerUnit: volume,
    canSwitchUnit: canSwitchPriceUnit(listing.priceUnit, volume),
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
