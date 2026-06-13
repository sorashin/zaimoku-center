import { Suspense, lazy } from 'react';
import type { ModelFormat } from '@/lib/types';

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
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center rounded-card bg-surface-muted">
      <div className="text-[13px] font-medium text-ink-sub">3Dビューアを準備中…</div>
    </div>
  );
}

/** 拡張子/format で GlbViewer / SplatViewer を出し分けるラッパー。 */
export function ModelViewer({ url, format, onFallback }: Props) {
  const resolved: ModelFormat =
    format ??
    (/\.(ply|splat|ksplat)(\?|$)/i.test(url) ? 'splat' : 'glb');

  return (
    <Suspense fallback={<Loading />}>
      {resolved === 'splat' ? (
        <SplatViewer url={url} onFallback={onFallback} />
      ) : (
        <GlbViewer url={url} onFallback={onFallback} />
      )}
    </Suspense>
  );
}
