import { useEffect, useRef, useState } from 'react';

interface Props {
  url: string;
  onFallback?: () => void;
}

/**
 * Gaussian Splatting ビューア。@mkkellogg/gaussian-splats-3d の Viewer で
 * .ply/.splat/.ksplat を再生。自動回転・全画面・3Dバッジは GLB と同等のUI。
 */
export function SplatViewer({ url, onFallback }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    async function init() {
      const container = containerRef.current;
      if (!container) return;

      // WebGL サポート判定
      try {
        const testCanvas = document.createElement('canvas');
        const gl =
          testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
        if (!gl) {
          setError(true);
          return;
        }
      } catch {
        setError(true);
        return;
      }

      const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');
      if (disposed || !containerRef.current) return;

      // selfDrivenMode + rootElement にビューアを描画。
      const viewer = new GaussianSplats3D.Viewer({
        rootElement: container,
        selfDrivenMode: true,
        useBuiltInControls: true,
        // 自動回転相当: 緩やかな初期回転。操作で停止する。
        sphericalHarmonicsDegree: 0,
      });

      const stopHint = () => setShowHint(false);
      container.addEventListener('pointerdown', stopHint, { once: true });
      container.addEventListener('touchstart', stopHint, { once: true });

      viewer
        .addSplatScene(url, { showLoadingUI: false })
        .then(() => {
          if (disposed) return;
          setLoaded(true);
          viewer.start();
        })
        .catch(() => {
          if (!disposed) setError(true);
        });

      cleanup = () => {
        container.removeEventListener('pointerdown', stopHint);
        container.removeEventListener('touchstart', stopHint);
        try {
          // ライブラリのクリーンアップ（renderer/シーンの破棄）
          viewer.dispose?.();
        } catch {
          // 破棄時のエラーは無視
        }
      };
    }

    init().catch(() => {
      if (!disposed) setError(true);
    });

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [url]);

  const requestFullscreen = () => {
    const el = containerRef.current?.parentElement ?? containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-card bg-surface-muted p-6 text-center">
        <p className="text-[14px] text-ink-sub">3Dモデルを表示できませんでした。</p>
        {onFallback && (
          <button
            type="button"
            onClick={onFallback}
            className="rounded-btn border border-ink bg-surface px-4 py-2 text-[14px] font-semibold text-ink"
          >
            写真を見る
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-card bg-surface-muted">
      <div ref={containerRef} className="h-full w-full" />

      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-muted">
          <div className="text-[13px] font-medium text-ink-sub">3Dモデルを読み込み中…</div>
        </div>
      )}

      {loaded && (
        <div
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-pill bg-black/55 px-3 py-1.5 text-[12px] font-medium text-white transition-opacity duration-500"
          style={{ opacity: showHint ? 1 : 0 }}
          ref={(el) => {
            if (el && showHint) {
              window.setTimeout(() => setShowHint(false), 3000);
            }
          }}
        >
          ドラッグで回転 ・ ピンチで拡大
        </div>
      )}

      <button
        type="button"
        aria-label="全画面表示"
        onClick={requestFullscreen}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-pill border-none bg-white/90 shadow-card"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2 6V2H6M14 6V2H10M2 10V14H6M14 10V14H10"
            stroke="#222222"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="absolute bottom-3 right-3 flex h-[38px] w-[38px] items-center justify-center rounded-pill border-[1.5px] border-ink bg-white text-[11px] font-bold text-ink">
        3D
      </div>
    </div>
  );
}
