import type { ListingWithSeller } from './types';
import {
  formatPrice,
  priceUnitLabel,
  timeAgo,
  volumePerUnit,
} from './format';

/** スペック表の1行 */
export interface SpecRow {
  k: string;
  v: string;
}

/** RequestSheet / MediaViewer 等の island に渡す、整形済みの軽量データ。 */
export interface DetailView {
  id: string;
  title: string;
  species: string;
  shape: 'sawn' | 'irregular';
  isSawn: boolean;
  has3d: boolean;
  modelUrl?: string;
  modelFormat?: 'glb' | 'splat';
  stock: number;
  price: number;
  /** 概算計算用の1本あたり材積（㎥）。sawn 以外は 0 */
  volumePerUnit: number;
  priceLabel: string;
  unitLabel: string;
  shapeLabel: string;
  stockLine: string;
  minUnitLabel: string;
  postedLabel: string;
  /** メディアエリアに渡す写真URL列 */
  photos: string[];
  mainPhoto: string;
  seller: {
    id: string;
    companyName: string;
    shortLabel: string;
    avatarColor: string;
    locationLabel: string;
  };
}

/** 詳細ページのスペック表行（値があるもののみ）。 */
export function buildSpecRows(listing: ListingWithSeller): SpecRow[] {
  const rows: SpecRow[] = [
    { k: '樹種', v: listing.species },
    { k: '形状', v: listing.shape === 'sawn' ? '製材済み' : '不定形材（一点物）' },
  ];

  if (listing.shape === 'sawn') {
    if (listing.lengthMm) rows.push({ k: '長手', v: `${listing.lengthMm.toLocaleString('ja-JP')} mm` });
    if (listing.widthMm) rows.push({ k: '短手', v: `${listing.widthMm.toLocaleString('ja-JP')} mm` });
    if (listing.thicknessMm) rows.push({ k: '厚み', v: `${listing.thicknessMm.toLocaleString('ja-JP')} mm` });
    const vol = volumePerUnit(listing);
    if (vol > 0) rows.push({ k: '材積', v: `約 ${vol.toFixed(4)} ㎥/本` });
    rows.push({ k: '在庫', v: `${listing.stock} 本` });
  } else {
    rows.push({ k: 'サイズ', v: '3Dスキャン参照' });
    rows.push({ k: '在庫', v: '1 点' });
  }

  // 質感メタ（値があるもののみ行表示）
  if (listing.moisture) rows.push({ k: '含水率', v: listing.moisture });
  if (listing.dryness) rows.push({ k: '乾燥状態', v: listing.dryness });
  if (listing.heartwood) rows.push({ k: '赤身・白太', v: listing.heartwood });
  if (listing.knots) rows.push({ k: '節の状態', v: listing.knots });

  return rows;
}

export function toDetailView(listing: ListingWithSeller): DetailView {
  const isSawn = listing.shape === 'sawn';
  const unitLabel = priceUnitLabel(listing.priceUnit);
  const main = listing.photos.find((p) => p.isMain) ?? listing.photos[0];
  return {
    id: listing.id,
    title: listing.title,
    species: listing.species,
    shape: listing.shape,
    isSawn,
    has3d: Boolean(listing.modelUrl),
    modelUrl: listing.modelUrl,
    modelFormat: listing.modelFormat,
    stock: listing.stock,
    price: listing.price,
    volumePerUnit: volumePerUnit(listing),
    priceLabel: formatPrice(listing.price),
    unitLabel,
    shapeLabel: isSawn ? '製材済み' : '不定形材',
    stockLine: isSawn ? `在庫 ${listing.stock} 本` : '一点物',
    minUnitLabel: listing.minUnitLabel,
    postedLabel: timeAgo(listing.postedAt),
    photos: listing.photos.map((p) => p.url),
    mainPhoto: main?.url ?? '',
    seller: {
      id: listing.seller.id,
      companyName: listing.seller.companyName,
      shortLabel: listing.seller.shortLabel,
      avatarColor: listing.seller.avatarColor,
      locationLabel: listing.seller.locationLabel,
    },
  };
}
