import { useRef, useState } from 'react';
import { SPECIES_OPTIONS, modelFormatFromUrl } from '@/lib/listingInput';
import type { Shape } from '@/lib/types';

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
  minUnitLabel: string;
  description?: string;
  moisture?: string;
  dryness?: string;
  heartwood?: string;
  knots?: string;
  modelUrl?: string;
  modelFormat?: 'glb' | 'splat';
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
  const [lengthMm, setLengthMm] = useState(initial?.lengthMm?.toString() ?? '');
  const [widthMm, setWidthMm] = useState(initial?.widthMm?.toString() ?? '');
  const [thicknessMm, setThicknessMm] = useState(initial?.thicknessMm?.toString() ?? '');
  const [stock, setStock] = useState(initial?.stock?.toString() ?? '');
  const [price, setPrice] = useState(initial?.price?.toString() ?? '');
  const [minUnitLabel, setMinUnitLabel] = useState(initial?.minUnitLabel ?? '1本からOK');

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
  const [dragOver, setDragOver] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

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

  // ===== 3Dモデル選択 =====
  async function handleModelFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!MODEL_EXT.includes(ext)) {
      setError('対応形式は .glb / .gltf / .ply / .splat / .ksplat です。');
      return;
    }
    setError('');
    setModelName(file.name);
    setModelSize(file.size);
    setModelSizeWarn(file.size > MODEL_SIZE_WARN);
    setModelUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'model');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !j.url) throw new Error(j.message || 'アップロードに失敗しました。');
      setModelUrl(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '3Dモデルのアップロードに失敗しました。');
      setModelName('');
      setModelSize(null);
    } finally {
      setModelUploading(false);
    }
  }

  function clearModel() {
    setModelUrl('');
    setModelName('');
    setModelSize(null);
    setModelSizeWarn(false);
    if (modelInputRef.current) modelInputRef.current.value = '';
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
      if (!lengthMm || !widthMm || !thicknessMm) return '寸法（長手・短手・厚み）を入力してください。';
      if (!stock || Number(stock) < 1) return '在庫本数を入力してください。';
    }
    if (!price || Number(price) <= 0) return '価格を入力してください。';
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
    return {
      title: title.trim(),
      species,
      shape,
      lengthMm: isSawn ? Number(lengthMm) : undefined,
      widthMm: isSawn ? Number(widthMm) : undefined,
      thicknessMm: isSawn ? Number(thicknessMm) : undefined,
      stock: isSawn ? Number(stock) : 1,
      price: Number(price),
      minUnitLabel: minUnitLabel.trim() || '1本からOK',
      description: description.trim() || undefined,
      moisture: moisture.trim() || undefined,
      dryness: dryness.trim() || undefined,
      heartwood: heartwood.trim() || undefined,
      knots: knots.trim() || undefined,
      modelUrl: modelUrl || undefined,
      modelFormat: modelUrl ? modelFormatFromUrl(modelUrl) : undefined,
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
    setLengthMm('');
    setWidthMm('');
    setThicknessMm('');
    setStock('');
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
        </p>
        {modelUrl || modelUploading ? (
          <div className="mt-3.5 flex items-center gap-3 rounded-btn border border-hairline bg-surface-muted px-4 py-3.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
              <path d="M12 2.5L20 7v10l-8 4.5L4 17V7l8-4.5Z" stroke="#222222" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M4 7l8 4.5L20 7M12 11.5V21.5" stroke="#222222" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{modelName || '3Dモデル'}</span>
              <span className="block text-[12px] text-ink-sub">
                {modelUploading
                  ? 'アップロード中…'
                  : modelSize !== null
                    ? fmtSize(modelSize)
                    : 'アップロード済み'}
              </span>
            </span>
            {!modelUploading && (
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

        {/* 形状で切替: 寸法・在庫 / 一点物案内 */}
        {isSawn ? (
          <div className={sectionClass}>
            <h2 className={`${sectionTitle} mb-4`}>寸法・在庫</h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['長手（mm）', lengthMm, setLengthMm, '2000'],
                ['短手（mm）', widthMm, setWidthMm, '180'],
                ['厚み（mm）', thicknessMm, setThicknessMm, '20'],
              ] as const).map(([lab, val, set, ph]) => (
                <span key={lab} className="block">
                  <label className="mb-1.5 block text-[12px] font-medium text-ink-sub">{lab}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder={ph}
                    className={`${inputClass} px-3`}
                  />
                </span>
              ))}
            </div>
            <label className="mb-1.5 mt-4 block text-[12px] font-medium text-ink-sub">在庫本数</label>
            <input
              type="number"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="13"
              className={`${inputClass} w-1/2 px-3`}
            />
          </div>
        ) : (
          <div className="mt-5 rounded-card bg-surface-muted px-4 py-3.5 text-[13px] leading-relaxed text-ink-sub">
            一点物として出品されます。サイズは3Dスキャン・写真からご確認いただく形になります。
          </div>
        )}

        {/* 価格 */}
        <div className={sectionClass}>
          <h2 className={`${sectionTitle} mb-4`}>価格</h2>
          <label className={labelClass}>{priceFieldLabel}</label>
          <input
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="例：20000"
            className={inputClass}
          />
          <label className={`${labelClass} mt-4.5`}>最小取引単位</label>
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
                  ¥{Number(price || 0).toLocaleString('ja-JP')}
                  <span className="text-[12px] font-normal text-ink-sub">{isSawn ? '/㎥' : ''}</span>
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
