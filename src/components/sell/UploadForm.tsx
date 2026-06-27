import { useRef, useState } from 'react';
import { SPECIES_OPTIONS, modelFormatFromUrl } from '@/lib/listingInput';
import { isGaussianSplatPly, compressPlyToKsplat } from '@/lib/splatCompress';
import {
  MODEL_ORIENTATION_OPTIONS,
  MODEL_ORIENTATION_DEFAULT,
} from '@/lib/modelOrientation';
import { ModelViewer } from '@/components/viewer/ModelViewer';
import type { ModelFormat, ModelOrientation, PriceUnit, Shape } from '@/lib/types';

// ===== 寸法・在庫・価格パターンのフォーム行 =====
interface VariantRow {
  id?: string;
  lengthMm: string;
  widthMm: string;
  thicknessMm: string;
  stock: string;
  price: string;
  priceUnit: PriceUnit;
  label: string;
}

function emptyVariant(): VariantRow {
  return {
    lengthMm: '',
    widthMm: '',
    thicknessMm: '',
    stock: '',
    price: '',
    priceUnit: 'per_m3',
    label: '',
  };
}

// ===== 初期値（編集モード） =====
export interface UploadFormInitial {
  id: string;
  title: string;
  species: string;
  shape: Shape;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  stock?: number;
  price?: number;
  /** 寸法・在庫・価格パターン（sawn）。編集時に復元する。 */
  variants?: {
    id?: string;
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
    stock: number;
    price: number;
    priceUnit: PriceUnit;
    label?: string;
  }[];
  minUnitLabel: string;
  description?: string;
  moisture?: string;
  dryness?: string;
  heartwood?: string;
  knots?: string;
  modelUrl?: string;
  modelFormat?: 'glb' | 'splat';
  modelOrientation?: ModelOrientation;
  modelPosterUrl?: string;
  photos: { url: string; isMain: boolean }[];
}

interface Props {
  sellerName: string;
  /** 編集モード時の初期値。未指定なら新規作成。 */
  initial?: UploadFormInitial;
}

interface PhotoSlot {
  url: string;
  uploading: boolean;
}

const MODEL_EXT = ['glb', 'gltf', 'ply', 'splat', 'ksplat'];
const MODEL_SIZE_WARN = 50 * 1024 * 1024; // 50MB 目安

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// 共通の入力スタイル（login.astro / RequestSheet と同系統。高さ52px・大きめタップ領域）
const inputClass =
  'w-full box-border h-[52px] rounded-btn border border-border-strong bg-surface px-3.5 text-[16px] text-ink outline-none transition-colors focus:border-ink focus:shadow-[inset_0_0_0_1px_#222222]';
const labelClass = 'block text-[13px] font-semibold mb-1.5';
const sectionClass = 'mt-7 border-t border-hairline pt-6.5';
const sectionTitle = 'text-[18px] font-semibold';

export function UploadForm({ sellerName, initial }: Props) {
  const isEdit = Boolean(initial);

  // 樹種: 選択肢にあればそのまま、無ければ「その他」+自由入力
  const initialSpeciesKnown =
    initial && SPECIES_OPTIONS.includes(initial.species as (typeof SPECIES_OPTIONS)[number]);
  const [speciesSel, setSpeciesSel] = useState<string>(
    initial ? (initialSpeciesKnown ? initial.species : 'その他') : 'カラマツ'
  );
  const [speciesOther, setSpeciesOther] = useState<string>(
    initial && !initialSpeciesKnown ? initial.species : ''
  );

  const [title, setTitle] = useState(initial?.title ?? '');
  const [shape, setShape] = useState<Shape>(initial?.shape ?? 'sawn');

  // sawn の寸法・在庫・価格パターン。編集時は既存パターンを復元、無ければ単一寸法から1行。
  const initialVariants: VariantRow[] = (() => {
    if (initial?.variants && initial.variants.length > 0) {
      return initial.variants.map((v) => ({
        id: v.id,
        lengthMm: v.lengthMm.toString(),
        widthMm: v.widthMm.toString(),
        thicknessMm: v.thicknessMm.toString(),
        stock: v.stock.toString(),
        price: v.price.toString(),
        priceUnit: v.priceUnit,
        label: v.label ?? '',
      }));
    }
    if (initial?.shape === 'sawn' && initial.lengthMm) {
      return [
        {
          lengthMm: initial.lengthMm?.toString() ?? '',
          widthMm: initial.widthMm?.toString() ?? '',
          thicknessMm: initial.thicknessMm?.toString() ?? '',
          stock: initial.stock?.toString() ?? '',
          price: initial.price?.toString() ?? '',
          priceUnit: 'per_m3' as PriceUnit,
          label: '',
        },
      ];
    }
    return [emptyVariant()];
  })();
  const [variants, setVariants] = useState<VariantRow[]>(initialVariants);

  // irregular（一点物）用の単一価格。
  const [price, setPrice] = useState(initial?.price?.toString() ?? '');
  const [minUnitLabel, setMinUnitLabel] = useState(initial?.minUnitLabel ?? '1本からOK');

  function updateVariant(idx: number, patch: Partial<VariantRow>) {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }
  function addVariant() {
    setVariants((prev) => [...prev, emptyVariant()]);
  }
  function removeVariant(idx: number) {
    setVariants((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  // 質感メタ（折りたたみ）
  const [metaOpen, setMetaOpen] = useState(
    Boolean(initial?.moisture || initial?.dryness || initial?.heartwood || initial?.knots || initial?.description)
  );
  const [moisture, setMoisture] = useState(initial?.moisture ?? '');
  const [dryness, setDryness] = useState(initial?.dryness ?? '');
  const [heartwood, setHeartwood] = useState(initial?.heartwood ?? '');
  const [knots, setKnots] = useState(initial?.knots ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  // 3Dモデル
  const [modelUrl, setModelUrl] = useState(initial?.modelUrl ?? '');
  const [modelName, setModelName] = useState('');
  const [modelSize, setModelSize] = useState<number | null>(null);
  const [modelSizeWarn, setModelSizeWarn] = useState(false);
  const [modelUploading, setModelUploading] = useState(false);
  // .ply（Gaussian Splatting）をブラウザ内で .ksplat に圧縮中の状態メッセージ
  const [modelCompressing, setModelCompressing] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // モデルフォーマット（プレビューのビューア出し分け用）。URL から判定。
  const modelFormat: ModelFormat | undefined = modelUrl
    ? modelFormatFromUrl(modelUrl)
    : undefined;

  // 向き補正プリセット
  const [modelOrientation, setModelOrientation] = useState<ModelOrientation>(
    initial?.modelOrientation ?? MODEL_ORIENTATION_DEFAULT
  );
  // 生成済みのプレビュー画像（一覧サムネ用）。ビューアからキャプチャしてアップロード。
  const [modelPosterUrl, setModelPosterUrl] = useState(initial?.modelPosterUrl ?? '');
  const [posterSaving, setPosterSaving] = useState(false);
  const [posterMsg, setPosterMsg] = useState<string | null>(null);
  // ビューアが渡してくるキャプチャ関数（現在の表示を PNG dataURL で取得）。
  const captureRef = useRef<(() => string | null) | null>(null);

  // 写真スロット（メイン + サブ2）
  const initialPhotos: PhotoSlot[] = [0, 1, 2].map((i) => ({
    url: initial?.photos[i]?.url ?? '',
    uploading: false,
  }));
  const [photos, setPhotos] = useState<PhotoSlot[]>(initialPhotos);
  const photoInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const species = speciesSel === 'その他' ? speciesOther.trim() : speciesSel;
  const isSawn = shape === 'sawn';
  const priceFieldLabel = isSawn ? '価格（¥/㎥）' : '価格（一点 ¥）';

  // 確認プレビュー用: sawn は最安パターン価格・単位、irregular は単一価格。
  const cheapestVariant = isSawn
    ? variants.reduce<VariantRow | null>((min, v) => {
        const p = Number(v.price);
        if (!Number.isFinite(p) || p <= 0) return min;
        if (!min || p < Number(min.price)) return v;
        return min;
      }, null)
    : null;
  const previewPrice = isSawn
    ? Number(cheapestVariant?.price || 0)
    : Number(price || 0);
  const previewUnit = isSawn
    ? cheapestVariant?.priceUnit === 'per_item'
      ? ''
      : '/㎥'
    : '';

  // ===== 3Dモデル選択 =====
  async function handleModelFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!MODEL_EXT.includes(ext)) {
      setError('対応形式は .glb / .gltf / .ply / .splat / .ksplat です。');
      return;
    }
    setError('');

    let uploadFile = file;

    // .ply が 3D Gaussian Splatting 形式なら、アップロード前にブラウザ内で
    // .ksplat（SH0圧縮）へ変換する。転送量・配信サイズが 1/4〜1/10 に減り、
    // 閲覧時のロードも速くなる。通常メッシュ PLY はそのままアップロード。
    if (ext === 'ply') {
      try {
        if (await isGaussianSplatPly(file)) {
          setModelCompressing('3Dスキャンを配信用に軽量圧縮中…');
          const { file: ksplat, originalBytes, compressedBytes } =
            await compressPlyToKsplat(file, 0);
          uploadFile = ksplat;
          setModelCompressing(
            `圧縮完了: ${fmtSize(originalBytes)} → ${fmtSize(compressedBytes)}`
          );
        }
      } catch (e) {
        setModelCompressing(null);
        setError(
          e instanceof Error
            ? `3Dスキャンの圧縮に失敗しました: ${e.message}`
            : '3Dスキャンの圧縮に失敗しました。'
        );
        return;
      }
    }

    setModelName(uploadFile.name);
    setModelSize(uploadFile.size);
    setModelSizeWarn(uploadFile.size > MODEL_SIZE_WARN);
    setModelUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('kind', 'model');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !j.url) throw new Error(j.message || 'アップロードに失敗しました。');
      setModelUrl(j.url);
      // 新しいモデルなので向き・プレビュー画像をリセット。
      setModelOrientation(MODEL_ORIENTATION_DEFAULT);
      setModelPosterUrl('');
      setPosterMsg(null);
      captureRef.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : '3Dモデルのアップロードに失敗しました。');
      setModelName('');
      setModelSize(null);
    } finally {
      setModelUploading(false);
      setModelCompressing(null);
    }
  }

  function clearModel() {
    setModelUrl('');
    setModelName('');
    setModelSize(null);
    setModelSizeWarn(false);
    setModelOrientation(MODEL_ORIENTATION_DEFAULT);
    setModelPosterUrl('');
    setPosterMsg(null);
    captureRef.current = null;
    if (modelInputRef.current) modelInputRef.current.value = '';
  }

  // dataURL(PNG) → File。ポスター画像のアップロード用。
  function dataUrlToFile(dataUrl: string, name: string): File | null {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const mime = m[1]!;
    const bin = atob(m[2]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  // 現在のプレビュー表示をキャプチャして一覧サムネ用のプレビュー画像として保存する。
  async function savePoster() {
    const capture = captureRef.current;
    if (!capture) {
      setPosterMsg('プレビューの準備ができていません。少し待ってからお試しください。');
      return;
    }
    setPosterSaving(true);
    setPosterMsg(null);
    try {
      const dataUrl = capture();
      if (!dataUrl) throw new Error('プレビュー画像を生成できませんでした。');
      const file = dataUrlToFile(dataUrl, 'model-poster.png');
      if (!file) throw new Error('プレビュー画像の変換に失敗しました。');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'photo');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !j.url) throw new Error(j.message || 'プレビュー画像の保存に失敗しました。');
      setModelPosterUrl(j.url);
      setPosterMsg('この向きをプレビュー画像として保存しました。');
    } catch (e) {
      setPosterMsg(e instanceof Error ? e.message : 'プレビュー画像の保存に失敗しました。');
    } finally {
      setPosterSaving(false);
    }
  }

  // ===== 写真選択 =====
  async function handlePhotoFile(idx: number, file: File) {
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください。');
      return;
    }
    setError('');
    setPhotos((prev) => prev.map((p, i) => (i === idx ? { ...p, uploading: true } : p)));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'photo');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !j.url) throw new Error(j.message || 'アップロードに失敗しました。');
      setPhotos((prev) => prev.map((p, i) => (i === idx ? { url: j.url!, uploading: false } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '写真のアップロードに失敗しました。');
      setPhotos((prev) => prev.map((p, i) => (i === idx ? { url: '', uploading: false } : p)));
    }
  }

  function clearPhoto(idx: number) {
    setPhotos((prev) => prev.map((p, i) => (i === idx ? { url: '', uploading: false } : p)));
    const ref = photoInputRefs[idx]?.current;
    if (ref) ref.value = '';
  }

  // ===== バリデーション → 確認ダイアログ =====
  function validate(): string | null {
    if (!title.trim()) return '商品名を入力してください。';
    if (!species) return '樹種を入力してください。';
    if (isSawn) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]!;
        const n = i + 1;
        if (!v.lengthMm || !v.widthMm || !v.thicknessMm)
          return `パターン${n}の寸法（長手・短手・厚み）を入力してください。`;
        if (!v.stock || Number(v.stock) < 1) return `パターン${n}の在庫本数を入力してください。`;
        if (!v.price || Number(v.price) <= 0) return `パターン${n}の価格を入力してください。`;
      }
    } else {
      if (!price || Number(price) <= 0) return '価格を入力してください。';
    }
    if (modelCompressing) return '3Dスキャンの圧縮完了をお待ちください。';
    if (modelUploading) return '3Dモデルのアップロード完了をお待ちください。';
    if (photos.some((p) => p.uploading)) return '写真のアップロード完了をお待ちください。';
    return null;
  }

  function openConfirm() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setConfirmOpen(true);
  }

  function buildPayload() {
    const photoList = photos
      .filter((p) => p.url)
      .map((p, i) => ({ url: p.url, isMain: i === 0 }));
    const variantPayload = isSawn
      ? variants.map((v, i) => ({
          id: v.id,
          lengthMm: Number(v.lengthMm),
          widthMm: Number(v.widthMm),
          thicknessMm: Number(v.thicknessMm),
          stock: Number(v.stock),
          price: Number(v.price),
          priceUnit: v.priceUnit,
          label: v.label.trim() || undefined,
          sort: i,
        }))
      : undefined;
    return {
      title: title.trim(),
      species,
      shape,
      // sawn は variants を送る。irregular は単一価格のみ。
      variants: variantPayload,
      price: isSawn ? undefined : Number(price),
      minUnitLabel: minUnitLabel.trim() || '1本からOK',
      description: description.trim() || undefined,
      moisture: moisture.trim() || undefined,
      dryness: dryness.trim() || undefined,
      heartwood: heartwood.trim() || undefined,
      knots: knots.trim() || undefined,
      modelUrl: modelUrl || undefined,
      modelFormat: modelUrl ? modelFormatFromUrl(modelUrl) : undefined,
      modelOrientation: modelUrl ? modelOrientation : undefined,
      modelPosterUrl: modelUrl ? modelPosterUrl || undefined : undefined,
      photos: photoList,
    };
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = buildPayload();
      const res = isEdit
        ? await fetch('/api/listings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: initial!.id, ...payload }),
          })
        : await fetch('/api/listings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !j.ok) throw new Error(j.message || '送信に失敗しました。');
      setConfirmOpen(false);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました。');
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setTitle('');
    setVariants([emptyVariant()]);
    setPrice('');
    setMinUnitLabel('1本からOK');
    setMoisture('');
    setDryness('');
    setHeartwood('');
    setKnots('');
    setDescription('');
    clearModel();
    setPhotos([0, 1, 2].map(() => ({ url: '', uploading: false })));
    setMetaOpen(false);
    setDone(false);
    setError('');
    window.scrollTo({ top: 0 });
  }

  // ===== 完了画面 =====
  if (done) {
    return (
      <div className="flex flex-col items-center px-7 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-pill bg-primary">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4.5 12.5L9.5 17.5L19.5 7" stroke="#222222" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mt-5 text-[20px] font-semibold">
          {isEdit ? '出品を更新しました' : '出品が完了しました'}
        </span>
        <span className="mt-2.5 text-[14px] leading-relaxed text-ink-sub">
          {isEdit ? '変更内容が一覧に反映されました。' : '商品が一覧に公開されました。'}
        </span>
        <a
          href="/"
          className="mt-7 flex h-[50px] w-full items-center justify-center rounded-btn bg-primary text-[16px] font-bold text-ink no-underline transition-colors hover:bg-primary-active"
        >
          一覧を確認する
        </a>
        {isEdit ? (
          <a
            href="/sell/manage"
            className="mt-2.5 flex h-[50px] w-full items-center justify-center rounded-btn border border-ink bg-surface text-[16px] font-semibold text-ink no-underline transition-colors hover:bg-surface-muted"
          >
            出品管理へ戻る
          </a>
        ) : (
          <button
            type="button"
            onClick={resetForm}
            className="mt-2.5 h-[50px] w-full rounded-btn border border-ink bg-surface text-[16px] font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            続けて出品する
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface px-4 py-3">
        <a
          href={isEdit ? '/sell/manage' : '/'}
          aria-label="戻る"
          className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-pill bg-surface-muted no-underline"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 2.5L4.5 8L10 13.5" stroke="#222222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <span className="text-[18px] font-semibold">{isEdit ? '出品を編集' : '商品を出品'}</span>
        <span className="ml-auto text-[13px] font-medium text-ink-sub">{sellerName}</span>
      </header>

      <div className="px-4 pb-12 pt-6">
        {/* 3Dモデル（任意） */}
        <h2 className={sectionTitle}>3Dモデル（任意）</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-sub">
          Scaniverse 等のスキャンアプリで書き出したファイルをそのままアップロードできます。
          3D Gaussian Splatting の .ply は、配信用に自動で軽量圧縮（.ksplat）されます。
        </p>
        {modelUrl || modelUploading || modelCompressing ? (
          <div className="mt-3.5 flex items-center gap-3 rounded-btn border border-hairline bg-surface-muted px-4 py-3.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
              <path d="M12 2.5L20 7v10l-8 4.5L4 17V7l8-4.5Z" stroke="#222222" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M4 7l8 4.5L20 7M12 11.5V21.5" stroke="#222222" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{modelName || '3Dモデル'}</span>
              <span className="block text-[12px] text-ink-sub">
                {modelCompressing
                  ? modelCompressing
                  : modelUploading
                    ? 'アップロード中…'
                    : modelSize !== null
                      ? fmtSize(modelSize)
                      : 'アップロード済み'}
              </span>
            </span>
            {!modelUploading && !modelCompressing && (
              <button
                type="button"
                onClick={clearModel}
                aria-label="3Dモデルを削除"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill border border-border-strong bg-surface text-ink-sub"
              >
                <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5" stroke="#6a6a6a" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => modelInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void handleModelFile(f);
            }}
            className={`mt-3.5 flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed px-4 py-8 transition-colors ${
              dragOver ? 'border-primary bg-primary-tint/40' : 'border-border-strong bg-surface'
            }`}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="#222222" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="#222222" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="mt-2.5 text-[14px] font-semibold">ファイルを選択 / ドラッグ＆ドロップ</span>
            <span className="mt-1 text-[12px] text-ink-sub">.glb / .gltf / .ply / .splat / .ksplat（50MB目安）</span>
          </button>
        )}
        {modelSizeWarn && (
          <p className="mt-2 text-[12px] text-danger">
            ファイルサイズが大きいため（50MB超）、アップロードに時間がかかる場合があります。
          </p>
        )}
        <input
          ref={modelInputRef}
          type="file"
          accept=".glb,.gltf,.ply,.splat,.ksplat"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleModelFile(f);
          }}
        />

        {/* 3Dプレビュー＋向き調整（アップロード完了後） */}
        {modelUrl && !modelUploading && !modelCompressing && (
          <div className="mt-4">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-surface-muted">
              <ModelViewer
                key={modelUrl}
                url={modelUrl}
                format={modelFormat}
                orientation={modelOrientation}
                onReady={(capture) => {
                  captureRef.current = capture;
                }}
              />
            </div>

            {/* 向きプリセット */}
            <div className="mt-3">
              <span className="block text-[13px] font-semibold">向きの補正</span>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-sub">
                スキャンの向きが上下逆さま・横倒しのときは、ここで正位置に補正できます。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {MODEL_ORIENTATION_OPTIONS.map((opt) => {
                  const active = modelOrientation === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setModelOrientation(opt.value);
                        // 向きを変えたらプレビュー画像は再生成が必要。
                        setPosterMsg(null);
                      }}
                      className={`h-10 rounded-btn border px-3.5 text-[13px] font-semibold transition-colors ${
                        active
                          ? 'border-ink bg-ink text-surface'
                          : 'border-border-strong bg-surface text-ink hover:bg-surface-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* プレビュー画像（一覧サムネ）の保存 */}
            <div className="mt-3.5 rounded-btn border border-hairline bg-surface-muted px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">一覧のサムネイル</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-sub">
                    {modelPosterUrl
                      ? 'この3Dモデルの見た目が一覧の1枚目に表示されます。'
                      : '「この向きで保存」を押すと、3Dの見た目を一覧の1枚目サムネイルにできます。'}
                  </span>
                </span>
                {modelPosterUrl && (
                  <img
                    src={modelPosterUrl}
                    alt="プレビュー"
                    className="h-12 w-12 flex-shrink-0 rounded-[8px] border border-hairline bg-surface object-cover"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => void savePoster()}
                disabled={posterSaving}
                className="mt-3 h-10 w-full rounded-btn border border-ink bg-surface text-[13px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                {posterSaving
                  ? '保存中…'
                  : modelPosterUrl
                    ? 'この向きで更新する'
                    : 'この向きでサムネイルを保存'}
              </button>
              {posterMsg && (
                <p className="mt-2 text-[12px] text-ink-sub">{posterMsg}</p>
              )}
            </div>
          </div>
        )}

        {/* 商品写真 */}
        <div className={sectionClass}>
          <h2 className={sectionTitle}>商品写真</h2>
          <p className="mt-1.5 text-[13px] text-ink-sub">1枚目がメイン写真として一覧・詳細に表示されます。</p>
          <div
            className="mt-3.5 grid gap-2"
            style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gridTemplateRows: '1fr 1fr' }}
          >
            {[0, 1, 2].map((i) => {
              const slot = photos[i]!;
              const isMain = i === 0;
              return (
                <div
                  key={i}
                  className="relative"
                  style={isMain ? { gridRow: 'span 2', minHeight: 180 } : { minHeight: 86 }}
                >
                  <button
                    type="button"
                    onClick={() => photoInputRefs[i]?.current?.click()}
                    className="flex h-full w-full items-center justify-center overflow-hidden rounded-card border border-border-strong bg-surface-muted"
                  >
                    {slot.url ? (
                      <img src={slot.url} alt="" className="h-full w-full object-cover" />
                    ) : slot.uploading ? (
                      <span className="text-[12px] text-ink-sub">アップロード中…</span>
                    ) : (
                      <span className="flex flex-col items-center text-ink-faint">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" stroke="#929292" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <span className="mt-1 text-[12px]">{isMain ? 'メイン写真' : `サブ ${i}`}</span>
                      </span>
                    )}
                  </button>
                  {slot.url && (
                    <button
                      type="button"
                      onClick={() => clearPhoto(i)}
                      aria-label="写真を削除"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-pill bg-black/55"
                    >
                      <svg width="11" height="11" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                        <path d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  <input
                    ref={photoInputRefs[i]}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handlePhotoFile(i, f);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 基本情報 */}
        <div className={sectionClass}>
          <h2 className={`${sectionTitle} mb-4`}>基本情報</h2>
          <label className={labelClass}>商品名</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：樺の木（製材済み）"
            className={inputClass}
          />

          <label className={`${labelClass} mt-4.5`}>樹種</label>
          <select
            value={speciesSel}
            onChange={(e) => setSpeciesSel(e.target.value)}
            className={`${inputClass} px-2.5`}
          >
            {SPECIES_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {speciesSel === 'その他' && (
            <input
              type="text"
              value={speciesOther}
              onChange={(e) => setSpeciesOther(e.target.value)}
              placeholder="樹種を入力"
              className={`${inputClass} mt-2.5`}
            />
          )}

          <label className={`${labelClass} mt-4.5`}>形状</label>
          <div className="flex gap-2">
            {(['sawn', 'irregular'] as const).map((s) => {
              const active = shape === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShape(s)}
                  className={`h-12 flex-1 rounded-btn border text-[14px] font-semibold transition-colors ${
                    active
                      ? 'border-ink bg-ink text-surface'
                      : 'border-border-strong bg-surface text-ink hover:bg-surface-muted'
                  }`}
                >
                  {s === 'sawn' ? '製材済み' : '不定形材（一点物）'}
                </button>
              );
            })}
          </div>
        </div>

        {/* 形状で切替: 寸法・在庫・価格パターン / 一点物案内＋単一価格 */}
        {isSawn ? (
          <div className={sectionClass}>
            <h2 className={`${sectionTitle} mb-1`}>寸法・在庫・価格パターン</h2>
            <p className="mb-4 text-[13px] leading-relaxed text-ink-sub">
              厚み・幅・長さの違うパターンを複数登録できます。在庫・価格はパターンごとに設定します。
            </p>

            <div className="flex flex-col gap-3.5">
              {variants.map((v, i) => (
                <div
                  key={i}
                  className="rounded-card border border-border-strong bg-surface p-3.5"
                >
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[13px] font-semibold">パターン {i + 1}</span>
                    {variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeVariant(i)}
                        aria-label={`パターン${i + 1}を削除`}
                        className="flex h-8 items-center gap-1 rounded-pill border border-border-strong bg-surface px-3 text-[12px] font-medium text-ink-sub transition-colors hover:bg-surface-muted"
                      >
                        <svg width="10" height="10" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                          <path d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5" stroke="#6a6a6a" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        削除
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['長手（mm）', 'lengthMm', '2000'],
                      ['短手（mm）', 'widthMm', '180'],
                      ['厚み（mm）', 'thicknessMm', '20'],
                    ] as const).map(([lab, key, ph]) => (
                      <span key={key} className="block">
                        <label className="mb-1.5 block text-[12px] font-medium text-ink-sub">{lab}</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={v[key]}
                          onChange={(e) => updateVariant(i, { [key]: e.target.value })}
                          placeholder={ph}
                          className={`${inputClass} px-3`}
                        />
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <span className="block">
                      <label className="mb-1.5 block text-[12px] font-medium text-ink-sub">在庫本数</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={v.stock}
                        onChange={(e) => updateVariant(i, { stock: e.target.value })}
                        placeholder="13"
                        className={`${inputClass} px-3`}
                      />
                    </span>
                    <span className="block">
                      <label className="mb-1.5 block text-[12px] font-medium text-ink-sub">
                        価格（{v.priceUnit === 'per_m3' ? '¥/㎥' : '¥/本'}）
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={v.price}
                        onChange={(e) => updateVariant(i, { price: e.target.value })}
                        placeholder="20000"
                        className={`${inputClass} px-3`}
                      />
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[12px] font-medium text-ink-sub">価格単位</span>
                    {(['per_m3', 'per_item'] as const).map((u) => {
                      const active = v.priceUnit === u;
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={() => updateVariant(i, { priceUnit: u })}
                          className={`h-8 rounded-pill border px-3 text-[12px] font-semibold transition-colors ${
                            active
                              ? 'border-ink bg-ink text-surface'
                              : 'border-border-strong bg-surface text-ink hover:bg-surface-muted'
                          }`}
                        >
                          {u === 'per_m3' ? '㎥単価' : '本単価'}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3">
                    <label className="mb-1.5 block text-[12px] font-medium text-ink-sub">
                      パターン名（任意）
                    </label>
                    <input
                      type="text"
                      value={v.label}
                      onChange={(e) => updateVariant(i, { label: e.target.value })}
                      placeholder="例：厚20タイプ（未入力なら寸法を表示）"
                      className={`${inputClass} px-3`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addVariant}
              className="mt-3.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-btn border border-dashed border-border-strong bg-surface text-[14px] font-semibold text-ink transition-colors hover:bg-surface-muted"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              パターンを追加
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-card bg-surface-muted px-4 py-3.5 text-[13px] leading-relaxed text-ink-sub">
            一点物として出品されます。サイズは3Dスキャン・写真からご確認いただく形になります。
          </div>
        )}

        {/* 価格（irregular の単一価格） / 最小取引単位 */}
        <div className={sectionClass}>
          <h2 className={`${sectionTitle} mb-4`}>{isSawn ? '取引設定' : '価格'}</h2>
          {!isSawn && (
            <>
              <label className={labelClass}>{priceFieldLabel}</label>
              <input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="例：20000"
                className={inputClass}
              />
            </>
          )}
          <label className={`${labelClass} ${isSawn ? '' : 'mt-4.5'}`}>最小取引単位</label>
          <input
            type="text"
            value={minUnitLabel}
            onChange={(e) => setMinUnitLabel(e.target.value)}
            placeholder="1本からOK"
            className={inputClass}
          />
        </div>

        {/* 質感・付加情報（折りたたみ） */}
        <div className={sectionClass}>
          <button
            type="button"
            onClick={() => setMetaOpen((o) => !o)}
            className="flex w-full items-center justify-between"
          >
            <span className={sectionTitle}>質感・付加情報（任意）</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              style={{ transform: metaOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <path d="M6 9l6 6 6-6" stroke="#222222" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {metaOpen && (
            <div className="mt-4">
              {([
                ['含水率', moisture, setMoisture, '例：18%（KD）'],
                ['乾燥状態', dryness, setDryness, '例：人工乾燥'],
                ['赤身・白太', heartwood, setHeartwood, '例：赤身多め'],
                ['節の状態', knots, setKnots, '例：節少なめ'],
              ] as const).map(([lab, val, set, ph]) => (
                <div key={lab} className="mb-3.5">
                  <label className={labelClass}>{lab}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder={ph}
                    className={inputClass}
                  />
                </div>
              ))}
              <label className={labelClass}>説明文</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="由来・特徴・おすすめの用途など"
                rows={4}
                className="w-full box-border resize-y rounded-btn border border-border-strong bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors focus:border-ink focus:shadow-[inset_0_0_0_1px_#222222]"
              />
            </div>
          )}
        </div>

        {error && <p className="mt-5 text-[13px] font-medium text-danger">{error}</p>}

        <button
          type="button"
          onClick={openConfirm}
          className="mt-6 h-[52px] w-full rounded-btn bg-primary text-[16px] font-bold text-ink transition-colors hover:bg-primary-active"
        >
          {isEdit ? '変更を保存する' : '出品する'}
        </button>
        <p className="mt-3 text-center text-[12px] text-ink-faint">
          「出品する」を押すと内容を確認のうえ、すぐに公開されます。
        </p>
      </div>

      {/* 確認ダイアログ */}
      {confirmOpen && (
        <>
          <div
            onClick={() => !submitting && setConfirmOpen(false)}
            className="fixed inset-0 z-[70] bg-black/50"
            style={{ animation: 'overlayFadeIn 0.2s ease' }}
          />
          <div
            className="fixed bottom-0 left-1/2 z-[71] w-full max-w-[480px] -translate-x-1/2 rounded-t-[20px] bg-surface px-5 pb-8 pt-5"
            style={{ animation: 'sheetUp 0.3s ease' }}
            role="dialog"
            aria-modal="true"
          >
            <span className="text-[18px] font-semibold">
              {isEdit ? 'この内容で更新します' : 'この内容で公開します'}
            </span>
            <p className="mt-1.5 text-[13px] text-ink-sub">よろしいですか？</p>

            {/* カードプレビュー簡易版 */}
            <div className="mt-4 flex items-center gap-3 rounded-card border border-hairline bg-surface p-3 shadow-card">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-[10px] bg-surface-muted">
                {photos[0]?.url ? (
                  <img src={photos[0].url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] text-ink-faint">写真なし</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{title || '（商品名未入力）'}</div>
                <div className="mt-0.5 text-[12px] text-ink-sub">
                  {species || '樹種未入力'} ・ {isSawn ? '製材済み' : '不定形材'}
                </div>
                <div className="mt-1 text-[15px] font-bold">
                  ¥{previewPrice.toLocaleString('ja-JP')}
                  <span className="text-[12px] font-normal text-ink-sub">{previewUnit}</span>
                  {isSawn && variants.length > 1 && (
                    <span className="ml-1 text-[12px] font-normal text-ink-sub">〜・{variants.length}パターン</span>
                  )}
                </div>
              </div>
            </div>

            {modelUrl && (
              <p className="mt-3 text-[12px] text-ink-sub">3Dモデル付きで公開されます。</p>
            )}

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="h-[50px] flex-1 rounded-btn border border-ink bg-surface text-[15px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="h-[50px] flex-1 rounded-btn bg-primary text-[15px] font-bold text-ink transition-colors hover:bg-primary-active disabled:opacity-60"
              >
                {submitting ? '送信中…' : isEdit ? '更新する' : '公開する'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
