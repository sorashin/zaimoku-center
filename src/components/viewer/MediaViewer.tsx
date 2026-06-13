import { useState } from 'react';
import type { ModelFormat } from '@/lib/types';
import { ModelViewer } from './ModelViewer';

interface Props {
  title: string;
  photos: string[];
  modelUrl?: string;
  modelFormat?: ModelFormat;
}

type Mode = '3d' | 'photo';

/**
 * 詳細ページのメディアエリア（主役）。
 * modelUrl があれば 3Dビューアをデフォルト表示し「3D（質感）⇔フォト」トグル＋サムネイル列。
 * modelUrl が無ければ横スワイプ写真ギャラリー（scroll-snap）。
 */
export function MediaViewer({ title, photos, modelUrl, modelFormat }: Props) {
  const has3d = Boolean(modelUrl);
  const [mode, setMode] = useState<Mode>(has3d ? '3d' : 'photo');
  // フォト時に表示する写真index
  const [photoIndex, setPhotoIndex] = useState(0);

  // ===== 3Dなし: 横スワイプ写真ギャラリー =====
  if (!has3d) {
    return (
      <div className="relative">
        <div
          className="no-scrollbar flex overflow-x-auto"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {photos.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`${title} 写真${i + 1}`}
              className="block aspect-[4/3] w-full flex-[0_0_100%] object-cover"
              style={{ scrollSnapAlign: 'start' }}
            />
          ))}
        </div>
        <div className="absolute bottom-3 right-3 rounded-pill bg-black/55 px-3 py-1.5 text-[12px] font-medium text-white">
          写真 {photos.length}枚
        </div>
      </div>
    );
  }

  // ===== 3Dあり: 3D⇔フォト切替＋サムネイル =====
  return (
    <div>
      <div className="relative aspect-[4/3] w-full bg-surface-muted md:rounded-card md:overflow-hidden">
        {mode === '3d' ? (
          <ModelViewer
            url={modelUrl!}
            format={modelFormat}
            onFallback={() => setMode('photo')}
          />
        ) : (
          <img
            src={photos[photoIndex] ?? photos[0]}
            alt={`${title} 写真${photoIndex + 1}`}
            className="block h-full w-full object-cover md:rounded-card"
          />
        )}
      </div>

      {/* 3D⇔フォト 切替トグル */}
      <div className="mt-3 flex justify-center px-4 md:px-0">
        <div className="inline-flex rounded-pill border border-hairline bg-surface p-1">
          <button
            type="button"
            onClick={() => setMode('3d')}
            className="rounded-pill px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={{
              background: mode === '3d' ? '#222222' : 'transparent',
              color: mode === '3d' ? '#ffffff' : '#222222',
            }}
          >
            3D（質感）
          </button>
          <button
            type="button"
            onClick={() => setMode('photo')}
            className="rounded-pill px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={{
              background: mode === 'photo' ? '#222222' : 'transparent',
              color: mode === 'photo' ? '#ffffff' : '#222222',
            }}
          >
            フォト
          </button>
        </div>
      </div>

      {/* サムネイル列（3D・写真各枚） */}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 md:px-0">
        <button
          type="button"
          onClick={() => setMode('3d')}
          aria-label="3Dビューア"
          className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-btn border-2 bg-surface-muted"
          style={{ borderColor: mode === '3d' ? '#FF9F1C' : 'var(--color-hairline)' }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-pill border-[1.5px] border-ink text-[10px] font-bold text-ink">
            3D
          </span>
        </button>
        {photos.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setMode('photo');
              setPhotoIndex(i);
            }}
            aria-label={`写真${i + 1}`}
            className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-btn border-2"
            style={{
              borderColor:
                mode === 'photo' && photoIndex === i ? '#FF9F1C' : 'var(--color-hairline)',
            }}
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
