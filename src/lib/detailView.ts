import type { ListingWithSeller, ModelOrientation, PriceUnit } from './types';
import {
  dimsLabel,
  formatPrice,
  priceUnitLabel,
  timeAgo,
  variantLabel,
  volumePerUnit,
} from './format';

/** スペック表の1行 */
export interface SpecRow {
  k: string;
  v: string;
}

/** 詳細画面のパターン選択チップ1つ分の整形済みデータ。 */
export interface VariantView {
  id: string;
  label: string;
  /** 寸法サブラベル（例: 厚20×幅180×長2000） */
  dimsLabel: string;
  stock: number;
  stockLine: string;
  price: number;
  priceUnit: PriceUnit;
  priceLabel: string;
  unitLabel: string;
  /** 概算計算用の1本あたり材積（㎥） */
  volumePerUnit: number;
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
  modelOrientation?: ModelOrientation;
  stock: number;
  price: number;
  priceUnit: PriceUnit;
  /** 寸法ラベル（sawn: 「2000×150×30mm」、irregular: 空文字） */
  dimensionLabel: string;
  /** 概算計算用の1本あたり材積（㎥）。sawn 以外は 0 */
  volumePerUnit: number;
  priceLabel: string;
  unitLabel: string;
  shapeLabel: string;
  stockLine: string;
  minUnitLabel: string;
  postedLabel: string;
  /** 寸法・在庫・価格パターン（sawn のみ非空）。詳細画面のチップ選択に使う。 */
  variants: VariantView[];
  /** パターンが2件以上あるか（チップUIの出し分け）。 */
  hasMultipleVariants: boolean;
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
    const variants = listing.variants;
    if (variants.length > 1) {
      // 複数パターン: 個別寸法は選択チップ側に委ね、ここでは概要のみ。
      const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
      rows.push({ k: 'パターン数', v: `${variants.length} パターン` });
      rows.push({ k: '在庫合計', v: `${totalStock} 本` });
    } else {
      if (listing.lengthMm) rows.push({ k: '長手', v: `${listing.lengthMm.toLocaleString('ja-JP')} mm` });
      if (listing.widthMm) rows.push({ k: '短手', v: `${listing.widthMm.toLocaleString('ja-JP')} mm` });
      if (listing.thicknessMm) rows.push({ k: '厚み', v: `${listing.thicknessMm.toLocaleString('ja-JP')} mm` });
      const vol = volumePerUnit(listing);
      if (vol > 0) rows.push({ k: '材積', v: `約 ${vol.toFixed(4)} ㎥/本` });
      rows.push({ k: '在庫', v: `${listing.stock} 本` });
    }
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

/** 寸法ラベル（sawn かつ寸法あり: 「2000×150×30mm」、それ以外: 空文字）。 */
function dimensionLabel(listing: ListingWithSeller): string {
  if (
    listing.shape === 'sawn' &&
    listing.lengthMm &&
    listing.widthMm &&
    listing.thicknessMm
  ) {
    return `${listing.lengthMm.toLocaleString('ja-JP')}×${listing.widthMm}×${listing.thicknessMm}mm`;
  }
  return '';
}

export function toDetailView(listing: ListingWithSeller): DetailView {
  const isSawn = listing.shape === 'sawn';
  const unitLabel = priceUnitLabel(listing.priceUnit);
  const main = listing.photos.find((p) => p.isMain) ?? listing.photos[0];

  // パターン整形（id を持つ＝DB保存済みのみ。sort順）。
  const variantViews: VariantView[] = isSawn
    ? [...listing.variants]
        .filter((v) => v.id)
        .sort((a, b) => a.sort - b.sort)
        .map((v) => {
          const vol = volumePerUnit(v);
          return {
            id: v.id!,
            label: variantLabel(v),
            dimsLabel: dimsLabel(v),
            stock: v.stock,
            stockLine: `在庫 ${v.stock} 本`,
            price: v.price,
            priceUnit: v.priceUnit,
            priceLabel: formatPrice(v.price),
            unitLabel: priceUnitLabel(v.priceUnit),
            volumePerUnit: vol,
          };
        })
    : [];

  return {
    id: listing.id,
    title: listing.title,
    species: listing.species,
    shape: listing.shape,
    isSawn,
    has3d: Boolean(listing.modelUrl),
    modelUrl: listing.modelUrl,
    modelFormat: listing.modelFormat,
    modelOrientation: listing.modelOrientation,
    stock: listing.stock,
    price: listing.price,
    priceUnit: listing.priceUnit,
    dimensionLabel: dimensionLabel(listing),
    volumePerUnit: volumePerUnit(listing),
    priceLabel: formatPrice(listing.price),
    unitLabel,
    shapeLabel: isSawn ? '製材済み' : '不定形材',
    stockLine: isSawn ? `在庫 ${listing.stock} 本` : '一点物',
    minUnitLabel: listing.minUnitLabel,
    postedLabel: timeAgo(listing.postedAt),
    variants: variantViews,
    hasMultipleVariants: variantViews.length > 1,
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
