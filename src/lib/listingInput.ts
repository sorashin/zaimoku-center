// 出品フォーム⇄API の共有: 入力の正規化・バリデーション・CreateListingInput への変換。
// クライアント（UploadForm）とサーバー（/api/listings）の双方から利用する。

import type { CreateListingInput, UpdateListingInput } from '@/lib/server/data';
import type { ListingPhoto, Shape, PriceUnit, ModelFormat } from '@/lib/types';
import { normalizeOrientation } from '@/lib/modelOrientation';

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

  let lengthMm: number | undefined;
  let widthMm: number | undefined;
  let thicknessMm: number | undefined;
  let stock = 1;
  let priceUnit: PriceUnit;

  if (shape === 'sawn') {
    lengthMm = num(payload.lengthMm);
    widthMm = num(payload.widthMm);
    thicknessMm = num(payload.thicknessMm);
    if (!lengthMm || !widthMm || !thicknessMm) {
      return { ok: false, error: '寸法（長手・短手・厚み）を入力してください。' };
    }
    if (lengthMm <= 0 || widthMm <= 0 || thicknessMm <= 0) {
      return { ok: false, error: '寸法は正の数で入力してください。' };
    }
    const s = num(payload.stock);
    if (!s || s < 1) {
      return { ok: false, error: '在庫本数を入力してください。' };
    }
    stock = Math.floor(s);
    priceUnit = 'per_m3';
  } else {
    stock = 1;
    priceUnit = 'per_item';
  }

  const price = num(payload.price);
  if (price === undefined) return { ok: false, error: '価格を入力してください。' };
  if (price <= 0) return { ok: false, error: '価格は正の数で入力してください。' };

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
    price: Math.round(price),
    priceUnit,
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
