import { useEffect, useRef, useState } from 'react';
import type { ModelFormat, ModelOrientation } from '@/lib/types';
import { onImgError, PLACEHOLDER_IMAGE } from '@/lib/image';
import { ModelViewer } from './ModelViewer';

interface Props {
  title: string;
  photos: string[];
  modelUrl?: string;
  modelFormat?: ModelFormat;
  modelOrientation?: ModelOrientation;
}

/**
 * 詳細ページのメディアエリア（主役）。
 * modelUrl があれば 1枚目サムネ(キャプチャ)=3Dビュー、2枚目以降=写真。サムネ選択で切替。
 * modelUrl が無ければ横スワイプ写真スライダー＋サムネイル列。
 */
export function MediaViewer({ title, photos, modelUrl, modelFormat, modelOrientation }: Props) {
  const has3d = Boolean(modelUrl);
  // 選択中サムネ index。3Dあり時は 0 = キャプチャ(=3Dビュー)、≥1 = 通常写真
  const [selected, setSelected] = useState(0);
  // 3D読み込み失敗時に写真へフォールバック
  const [model3dFailed, setModel3dFailed] = useState(false);
  // ライトボックス（全画面ズーム）。null=閉、数値=開いている写真index
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // ===== 3Dなし: 横スワイプ写真スライダー =====
  if (!has3d) {
    return (
      <PhotoSlider
        title={title}
        photos={photos}
        onOpen={(i) => setLightboxIndex(i)}
        lightbox={
          lightboxIndex !== null ? (
            <Lightbox
              title={title}
              photos={photos}
              index={lightboxIndex}
              onIndexChange={setLightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          ) : null
        }
      />
    );
  }

  // ===== 3Dあり: 先頭サムネ=3Dビュー、以降=写真。トグルなし =====
  // 0枚目を選択 かつ 3D失敗していない → 3Dビュー
  const show3d = selected === 0 && !model3dFailed;

  return (
    <div>
      <div className="relative aspect-[4/3] w-full bg-surface-muted md:rounded-card md:overflow-hidden">
        {show3d ? (
          <ModelViewer
            url={modelUrl!}
            format={modelFormat}
            orientation={modelOrientation}
            onFallback={() => setModel3dFailed(true)}
          />
        ) : (
          <img
            src={photos[selected] ?? photos[0] ?? PLACEHOLDER_IMAGE}
            alt={`${title} 写真${selected + 1}`}
            onError={onImgError}
            onClick={() => setLightboxIndex(selected)}
            className="block h-full w-full cursor-zoom-in object-cover md:rounded-card"
          />
        )}
      </div>

      {/* サムネイル列（先頭=キャプチャ/3D、以降=写真） */}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 md:px-0">
        {photos.map((src, i) => {
          const is3dThumb = i === 0;
          const active = is3dThumb ? show3d : selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={is3dThumb ? '3Dビュー' : `写真${i + 1}`}
              className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-btn border-2"
              style={{ borderColor: active ? '#FF9F1C' : 'var(--color-hairline)' }}
            >
              <img src={src || PLACEHOLDER_IMAGE} alt="" onError={onImgError} className="h-full w-full object-cover" />
              {is3dThumb && (
                <span className="absolute bottom-1 right-1 flex h-5 items-center rounded-pill border border-white bg-black/45 px-1.5 text-[9px] font-bold text-white">
                  3D
                </span>
              )}
            </button>
          );
        })}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          title={title}
          photos={photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * 横スワイプ写真スライダー。
 * scroll-snap でスワイプ、左右矢印（≥md）・ドット・カウンターでナビゲート。
 */
function PhotoSlider({
  title,
  photos,
  onOpen,
  lightbox,
}: {
  title: string;
  photos: string[];
  onOpen: (index: number) => void;
  lightbox: React.ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // ドラッグ中の追従オフセット(px)。null=非ドラッグ
  const [dragDx, setDragDx] = useState<number | null>(null);
  const count = photos.length;

  // スワイプ判定: pointerdown位置・時刻を記録
  const press = useRef<{ x: number; y: number; t: number; w: number } | null>(null);

  const goTo = (i: number) => {
    setIndex(Math.max(0, Math.min(count - 1, i)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button != null && e.button !== 0) return; // 左クリック/タッチのみ
    const w = trackRef.current?.clientWidth ?? 1;
    press.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, w };
    setDragDx(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = press.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    // 端では引っ張り抵抗（行き過ぎを 1/3 に減衰）
    let eff = dx;
    if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) eff = dx / 3;
    setDragDx(eff);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = press.current;
    press.current = null;
    setDragDx(null);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const elapsed = e.timeStamp - s.t;
    const absX = Math.abs(dx);

    // クリック判定: ほぼ動かず短時間 → ライトボックス（現在表示中の写真）
    if (absX < 10 && Math.abs(dy) < 10 && elapsed < 500) {
      onOpen(index);
      return;
    }
    // スワイプ判定: 横移動が縦より大きく、幅の15%超 or すばやいフリック → 必ず1枚だけ移動
    const flick = elapsed < 300 && absX > 30;
    if (absX > Math.abs(dy) && (absX > s.w * 0.15 || flick)) {
      goTo(dx < 0 ? index + 1 : index - 1);
    }
    // それ未満は同じ位置に戻る（index据え置き）
  };

  // ドラッグ中にスクロール等で中断された場合のリセット
  const onPointerCancel = () => {
    press.current = null;
    setDragDx(null);
  };

  // キーボード操作（左右矢印）
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === 'ArrowRight') goTo(index + 1);
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [index, count]);

  const dragging = dragDx !== null;

  return (
    <div>
      <div className="relative overflow-hidden md:rounded-card">
      <div
        ref={trackRef}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="flex touch-pan-y outline-none"
        style={{
          transform: `translateX(calc(${-index * 100}% + ${dragDx ?? 0}px))`,
          transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {photos.map((src, i) => (
          <img
            key={i}
            src={src || PLACEHOLDER_IMAGE}
            alt={`${title} 写真${i + 1}`}
            onError={onImgError}
            draggable={false}
            className="block aspect-[4/3] w-full flex-[0_0_100%] cursor-zoom-in select-none object-cover"
          />
        ))}
      </div>

      {count > 1 && (
        <>
          {/* 左右矢印（メルカリ風・全幅で常時表示。端ではフェードアウト） */}
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="前の写真"
            className="absolute left-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill bg-black/35 text-white backdrop-blur-sm transition-opacity hover:bg-black/50 disabled:pointer-events-none disabled:opacity-0 md:left-3 md:h-10 md:w-10"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M11.5 3.5L6 9l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === count - 1}
            aria-label="次の写真"
            className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill bg-black/35 text-white backdrop-blur-sm transition-opacity hover:bg-black/50 disabled:pointer-events-none disabled:opacity-0 md:right-3 md:h-10 md:w-10"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* ドットインジケーター */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-pill bg-white transition-all"
                style={{
                  width: i === index ? 16 : 6,
                  opacity: i === index ? 1 : 0.55,
                  boxShadow: '0 0 2px rgba(0,0,0,0.4)',
                }}
              />
            ))}
          </div>

          {/* カウンター */}
          <div className="absolute bottom-3 right-3 rounded-pill bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white">
            {index + 1} / {count}
          </div>
        </>
      )}
      </div>

      {/* サムネイル列 */}
      {count > 1 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 md:px-0">
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`写真${i + 1}`}
              className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-btn border-2"
              style={{ borderColor: index === i ? '#FF9F1C' : 'var(--color-hairline)' }}
            >
              <img src={src || PLACEHOLDER_IMAGE} alt="" onError={onImgError} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox}
    </div>
  );
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/**
 * 全画面ライトボックス。
 * - ピンチイン/アウト（2本指）で拡大縮小
 * - ホイール / ダブルタップ・ダブルクリックでズーム
 * - 拡大中は1本指/ドラッグでパン
 * - 等倍時のみ左右スワイプ・矢印で写真切替
 */
function Lightbox({
  title,
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  title: string;
  photos: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const count = photos.length;
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // アクティブなポインタ（pointerId -> 座標）
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  // ピンチ開始時の指間距離と scale
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  // パン/スワイプ開始時の基準
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = useRef(0);

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const goTo = (i: number) => {
    const next = (i + count) % count;
    onIndexChange(next);
    reset();
  };

  // body スクロールロック + ESC/矢印
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === 'ArrowRight') goTo(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [index, count]);

  const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
      // ダブルタップ判定
      const now = e.timeStamp;
      if (now - lastTap.current < 280) {
        toggleZoom();
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clampScale((dist / pinchStart.current.dist) * pinchStart.current.scale);
      setScale(next);
      if (next <= 1) {
        setTx(0);
        setTy(0);
      }
    } else if (pointers.current.size === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (scale > 1) {
        // パン
        setTx(dragStart.current.tx + dx);
        setTy(dragStart.current.ty + dy);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    pointers.current.delete(e.pointerId);

    if (pointers.current.size < 2) pinchStart.current = null;

    // 等倍時の横スワイプで写真切替
    if (scale <= 1 && start && pointers.current.size === 0) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        goTo(dx < 0 ? index + 1 : index - 1);
      }
    }
    if (pointers.current.size === 0) dragStart.current = null;
  };

  const toggleZoom = () => {
    if (scale > 1) {
      reset();
    } else {
      setScale(2.5);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const next = clampScale(scale - e.deltaY * 0.0015 * scale);
    setScale(next);
    if (next <= 1) {
      setTx(0);
      setTy(0);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black"
      style={{ animation: 'overlayFadeIn 0.2s ease' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 写真ビューア`}
    >
      {/* ヘッダー */}
      <div className="relative flex h-14 flex-shrink-0 items-center justify-center px-4 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-pill text-white/90 hover:bg-white/10"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-[15px] font-semibold">拡大・縮小</span>
      </div>

      {/* 画像エリア */}
      <div
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={toggleZoom}
        style={{ cursor: scale > 1 ? 'grab' : 'zoom-in' }}
      >
        <img
          src={photos[index] || PLACEHOLDER_IMAGE}
          alt={`${title} 写真${index + 1}`}
          onError={onImgError}
          draggable={false}
          className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: pointers.current.size ? 'none' : 'transform 0.18s ease-out',
          }}
        />

        {/* 左右ナビ（複数枚かつ等倍時） */}
        {count > 1 && scale <= 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label="前の写真"
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-pill bg-white/15 text-white backdrop-blur hover:bg-white/25"
            >
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M11.5 3.5L6 9l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="次の写真"
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-pill bg-white/15 text-white backdrop-blur hover:bg-white/25"
            >
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* カウンター */}
      {count > 1 && (
        <div className="flex h-12 flex-shrink-0 items-center justify-center text-[14px] font-medium text-white/90">
          {index + 1} / {count}
        </div>
      )}
    </div>
  );
}
