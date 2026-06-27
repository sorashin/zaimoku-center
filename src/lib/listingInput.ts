// 出品フォーム⇄API の共有: 入力の正規化・バリデーション・CreateListingInput への変換。
// クライアント（UploadForm）とサーバー（/api/listings）の双方から利用する。

import type { CreateListingInput, UpdateListingInput } from '@/lib/server/data';
import type { ListingPhoto, ListingVariant, Shape, PriceUnit, ModelFormat } from '@/lib/types';
import { normalizeOrientation } from '@/lib/modelOrientation';
import { mirrorFromVariants } from '@/lib/format';

/** 樹種の選択肢（「その他」は自由入力に切替） */
export const SPECIES_OPTIONS = [
  'カラマツ',
  'アカマツ',
  'スギ',
  'ヒノキ',
  'カバ',
  'ホオノキ',
  'クリ',
  'ナラ',
  'サクラ',
  'ケヤキ',
  'その他',
] as const;

/** フォームから送られてくる生ペイロード（JSON） */
export interface ListingFormPayload {
  title?: unknown;
  species?: unknown;
  shape?: unknown;
  lengthMm?: unknown;
  widthMm?: unknown;
  thicknessMm?: unknown;
  stock?: unknown;
  price?: unknown;
  /** 寸法・在庫・価格パターン（sawn）。新フォームはこちらを送る。 */
  variants?: unknown;
  minUnitLabel?: unknown;
  description?: unknown;
  moisture?: unknown;
  dryness?: unknown;
  heartwood?: unknown;
  knots?: unknown;
  modelUrl?: unknown;
  modelFormat?: unknown;
  modelPosterUrl?: unknown;
  modelOrientation?: unknown;
  photos?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  /** 最初のエラーメッセージ（フォーム表示用） */
  error?: string;
  input?: CreateListingInput;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** 拡張子からモデルフォーマット（glb系 or splat系）を判定 */
export function modelFormatFromUrl(url: string): ModelFormat | undefined {
  const m = /\.([a-zA-Z0-9]+)(?:\?|#|$)/.exec(url);
  const ext = m ? m[1]!.toLowerCase() : '';
  if (ext === 'glb' || ext === 'gltf') return 'glb';
  if (ext === 'ply' || ext === 'splat' || ext === 'ksplat') return 'splat';
  return undefined;
}

function normalizePhotos(raw: unknown): ListingPhoto[] {
  if (!Array.isArray(raw)) return [];
  const photos: ListingPhoto[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const url = str((item as { url?: unknown }).url);
      if (url) {
        photos.push({ url, isMain: Boolean((item as { isMain?: unknown }).isMain) });
      }
    }
  }
  // メインが無ければ先頭をメインに。
  if (photos.length > 0 && !photos.some((p) => p.isMain)) {
    photos[0]!.isMain = true;
  }
  return photos;
}

/** バリエーション正規化の結果。 */
interface VariantsResult {
  ok: boolean;
  error?: string;
  variants?: ListingVariant[];
}

/**
 * sawn のパターン配列を検証・正規化する。
 * 各パターンは 長手・短手・厚み・在庫・価格 が必須で正の数。価格単位は per_m3|per_item。
 * 後方互換: variants が無い旧フォーム（単一寸法）は payload の単一値から1パターンを生成。
 */
function normalizeVariants(payload: ListingFormPayload): VariantsResult {
  const raw = payload.variants;
  let list: unknown[];
  if (Array.isArray(raw) && raw.length > 0) {
    list = raw;
  } else {
    // 旧形式フォールバック: 単一寸法から1パターン。
    list = [
      {
        lengthMm: payload.lengthMm,
        widthMm: payload.widthMm,
        thicknessMm: payload.thicknessMm,
        stock: payload.stock,
        price: payload.price,
      },
    ];
  }

  const variants: ListingVariant[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `パターン${i + 1}の入力が不正です。` };
    }
    const o = item as Record<string, unknown>;
    const lengthMm = num(o.lengthMm);
    const widthMm = num(o.widthMm);
    const thicknessMm = num(o.thicknessMm);
    if (!lengthMm || !widthMm || !thicknessMm) {
      return { ok: false, error: `パターン${i + 1}の寸法（長手・短手・厚み）を入力してください。` };
    }
    if (lengthMm <= 0 || widthMm <= 0 || thicknessMm <= 0) {
      return { ok: false, error: `パターン${i + 1}の寸法は正の数で入力してください。` };
    }
    const s = num(o.stock);
    if (!s || s < 1) {
      return { ok: false, error: `パターン${i + 1}の在庫本数を入力してください。` };
    }
    const p = num(o.price);
    if (p === undefined || p <= 0) {
      return { ok: false, error: `パターン${i + 1}の価格を入力してください。` };
    }
    const unitRaw = str(o.priceUnit);
    const priceUnit: PriceUnit = unitRaw === 'per_item' ? 'per_item' : 'per_m3';
    const label = str(o.label) || undefined;
    variants.push({
      lengthMm,
      widthMm,
      thicknessMm,
      stock: Math.floor(s),
      price: Math.round(p),
      priceUnit,
      label,
      sort: i,
    });
  }
  return { ok: true, variants };
}

/**
 * 生ペイロードを検証し CreateListingInput を組み立てる。
 * sellerId は呼び出し側（API）でセッションから付与する。
 */
export function validateListingPayload(
  payload: ListingFormPayload,
  sellerId: string
): ValidationResult {
  const title = str(payload.title);
  if (!title) return { ok: false, error: '商品名を入力してください。' };

  const species = str(payload.species);
  if (!species) return { ok: false, error: '樹種を入力してください。' };

  const shape: Shape = payload.shape === 'irregular' ? 'irregular' : 'sawn';

  // ミラー値（listings 本体へ保存）。sawn は variants から算出、irregular は単一値。
  let lengthMm: number | undefined;
  let widthMm: number | undefined;
  let thicknessMm: number | undefined;
  let stock = 1;
  let price: number;
  let priceUnit: PriceUnit;
  let variants: ListingVariant[] = [];

  if (shape === 'sawn') {
    const vr = normalizeVariants(payload);
    if (!vr.ok || !vr.variants) {
      return { ok: false, error: vr.error };
    }
    variants = vr.variants;
    // 先頭寸法・在庫合計・最安価格をミラー（規則は format.ts の mirrorFromVariants に集約）。
    const m = mirrorFromVariants(variants)!; // variants は1件以上が保証される
    ({ lengthMm, widthMm, thicknessMm, stock, price, priceUnit } = m);
  } else {
    // irregular: 一点物。単一価格のみ。
    stock = 1;
    priceUnit = 'per_item';
    const p = num(payload.price);
    if (p === undefined) return { ok: false, error: '価格を入力してください。' };
    if (p <= 0) return { ok: false, error: '価格は正の数で入力してください。' };
    price = Math.round(p);
  }

  const minUnitLabel = str(payload.minUnitLabel) || '1本からOK';

  const modelUrl = str(payload.modelUrl) || undefined;
  let modelFormat: ModelFormat | undefined;
  if (modelUrl) {
    const fmtRaw = str(payload.modelFormat);
    modelFormat =
      fmtRaw === 'glb' || fmtRaw === 'splat'
        ? fmtRaw
        : modelFormatFromUrl(modelUrl);
  }
  // 3Dモデルのプレビュー画像（あれば一覧サムネに使う）。モデルが無ければ無視。
  const modelPosterUrl = modelUrl ? str(payload.modelPosterUrl) || undefined : undefined;
  // 向き補正プリセット。モデルが無ければ無視（default 相当）。
  const modelOrientation = modelUrl ? normalizeOrientation(payload.modelOrientation) : undefined;

  const photos = normalizePhotos(payload.photos);

  const input: CreateListingInput = {
    sellerId,
    title,
    species,
    shape,
    lengthMm,
    widthMm,
    thicknessMm,
    stock,
    price,
    priceUnit,
    variants,
    minUnitLabel,
    status: 'published',
    description: str(payload.description) || undefined,
    moisture: str(payload.moisture) || undefined,
    dryness: str(payload.dryness) || undefined,
    heartwood: str(payload.heartwood) || undefined,
    knots: str(payload.knots) || undefined,
    modelUrl,
    modelFormat,
    modelPosterUrl,
    modelOrientation,
    photos,
  };

  return { ok: true, input };
}

/** 編集時の部分更新を組み立てる（フル検証は createと同じパスを通す想定で sellerId 付き）。 */
export function buildUpdateInput(input: CreateListingInput): UpdateListingInput {
  // sellerId は更新不可（UpdateListingInput から除外済み）。
  const { sellerId: _sellerId, ...rest } = input;
  return rest;
}
