import { Suspense, lazy } from 'react';
import type { ModelFormat, ModelOrientation } from '@/lib/types';

// three / gaussian-splats-3d を含むビューアは遅延ロードしてメインバンドルから分離する。
const GlbViewer = lazy(() =>
  import('./GlbViewer').then((m) => ({ default: m.GlbViewer }))
);
const SplatViewer = lazy(() =>
  import('./SplatViewer').then((m) => ({ default: m.SplatViewer }))
);

interface Props {
  url: string;
  format?: ModelFormat;
  /** 写真モードへ切り替える導線（ロード失敗時など） */
  onFallback?: () => void;
  /** 向き補正プリセット */
  orientation?: ModelOrientation;
  /** 現在表示の PNG dataURL キャプチャ関数を親へ渡す（ポスター生成用） */
  onReady?: (capture: () => string | null) => void;
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center rounded-card bg-surface-muted">
      <div className="text-[13px] font-medium text-ink-sub">3Dビューアを準備中…</div>
    </div>
  );
}

/** 拡張子/format で GlbViewer / SplatViewer を出し分けるラッパー。 */
export function ModelViewer({ url, format, onFallback, orientation, onReady }: Props) {
  const resolved: ModelFormat =
    format ??
    (/\.(ply|splat|ksplat)(\?|$)/i.test(url) ? 'splat' : 'glb');

  return (
    <Suspense fallback={<Loading />}>
      {resolved === 'splat' ? (
        <SplatViewer url={url} onFallback={onFallback} orientation={orientation} onReady={onReady} />
      ) : (
        <GlbViewer url={url} onFallback={onFallback} orientation={orientation} onReady={onReady} />
      )}
    </Suspense>
  );
}
