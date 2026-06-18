import { useEffect, useRef, useState } from 'react';
import type { ModelOrientation } from '@/lib/modelOrientation';
import { orientationToRadians } from '@/lib/modelOrientation';

interface Props {
  url: string;
  onFallback?: () => void;
  /** 向き補正プリセット（既定: 'default'） */
  orientation?: ModelOrientation;
  /**
   * 現在の表示を PNG dataURL として取得する関数を親へ渡す。
   * 出品フォームでのポスター画像キャプチャに使う。
   */
  onReady?: (capture: () => string | null) => void;
}

/**
 * 3D Gaussian Splatting ビューア。@mkkellogg/gaussian-splats-3d の Viewer で
 * .ksplat（推奨・事前圧縮）/.ply/.splat を再生する。
 *
 * 配信は scripts/convert-splat.mjs で生 PLY を .ksplat（SH0, 16bit量子化）へ
 * 事前圧縮したものを想定。実行時パースが不要なぶんロードが速い。生 PLY を
 * 直接渡しても表示はできるが重いので非推奨。
 *
 * GLB ビューアと挙動を揃える: 自動回転（初回操作で恒久停止）、ローディング進捗、
 * 操作ヒント、全画面、右下3Dバッジ。
 *
 * 外部レンダラ/カメラ/OrbitControls を自前で構築する。これにより
 * (1) preserveDrawingBuffer でポスター画像をキャプチャでき、
 * (2) splatMesh の rotation で向き補正を動的に適用できる。
 */
export function SplatViewer({ url, onFallback, orientation, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // splatMesh（THREE.Object3D）を保持し、orientation 変化時に回転だけ更新する。
  const splatMeshRef = useRef<{ rotation: { set: (x: number, y: number, z: number) => void } } | null>(null);

  // orientation の適用（再ロードなしで回転だけ更新）
  useEffect(() => {
    const mesh = splatMeshRef.current;
    if (!mesh) return;
    const [rx, ry, rz] = orientationToRadians(orientation);
    mesh.rotation.set(rx, ry, rz);
  }, [orientation, loaded]);

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

      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');
      if (disposed || !containerRef.current) return;

      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;

      // 外部レンダラ: preserveDrawingBuffer でポスター画像キャプチャを可能にする。
      const renderer = new THREE.WebGLRenderer({
        antialias: false,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(new THREE.Color(0x000000), 0);
      container.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
      camera.position.set(0, 0.8, 3);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = false;
      controls.autoRotateSpeed = 1.2;

      // selfDrivenMode:false + 外部 renderer/camera で、描画ループは自前で回す。
      const viewer = new GaussianSplats3D.Viewer({
        selfDrivenMode: false,
        useBuiltInControls: false,
        renderer,
        camera,
        sharedMemoryForWorkers: false, // COOP/COEP ヘッダ不要にする（Pages 配信向け）
        sphericalHarmonicsDegree: 0,
      });

      // 初回操作で自動回転を恒久停止＋ヒント消去
      const stopAuto = () => {
        controls.autoRotate = false;
        setShowHint(false);
      };
      renderer.domElement.addEventListener('pointerdown', stopAuto, { once: true });
      renderer.domElement.addEventListener('touchstart', stopAuto, { once: true });
      renderer.domElement.addEventListener('wheel', stopAuto, { once: true });

      let raf = 0;
      const renderOnce = () => {
        controls.update();
        viewer.update();
        viewer.render();
      };
      const animate = () => {
        raf = requestAnimationFrame(animate);
        renderOnce();
      };

      const onResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth || 1;
        const h = containerRef.current.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      viewer
        .addSplatScene(url, {
          showLoadingUI: false,
          progressiveLoad: true,
          onProgress: (percent: number) => {
            if (!disposed) setProgress(Math.round(percent));
          },
        })
        .then(() => {
          if (disposed) return;

          // splatMesh に向き補正を適用。
          const splatMesh = viewer.getSplatMesh?.();
          if (splatMesh) {
            splatMeshRef.current = splatMesh as unknown as {
              rotation: { set: (x: number, y: number, z: number) => void };
            };
            const [rx, ry, rz] = orientationToRadians(orientation);
            splatMesh.rotation.set(rx, ry, rz);
          }

          setLoaded(true);
          controls.autoRotate = true;
          animate();

          // 親へポスター画像キャプチャ関数を渡す。
          onReadyRef.current?.(() => {
            try {
              renderOnce();
              return renderer.domElement.toDataURL('image/png');
            } catch {
              return null;
            }
          });
        })
        .catch(() => {
          if (!disposed) setError(true);
        });

      cleanup = () => {
        cancelAnimationFrame(raf);
        splatMeshRef.current = null;
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('pointerdown', stopAuto);
        renderer.domElement.removeEventListener('touchstart', stopAuto);
        renderer.domElement.removeEventListener('wheel', stopAuto);
        controls.dispose();
        try {
          viewer.dispose?.();
        } catch {
          // 破棄時のエラーは無視
        }
        try {
          renderer.dispose();
        } catch {
          // 無視
        }
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
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
          <div className="text-[13px] font-medium text-ink-sub">
            3Dモデルを読み込み中… {progress > 0 ? `${progress}%` : ''}
          </div>
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
