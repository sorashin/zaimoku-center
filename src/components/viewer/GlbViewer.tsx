import { useEffect, useRef, useState } from 'react';
import type { ModelOrientation } from '@/lib/modelOrientation';
import { orientationToRadians } from '@/lib/modelOrientation';

interface Props {
  url: string;
  /** 写真への切替導線（フォトモードへ） */
  onFallback?: () => void;
  /** 向き補正プリセット（既定: 'default'） */
  orientation?: ModelOrientation;
  /**
   * 現在の表示を PNG dataURL として取得する関数を親へ渡す。
   * 出品フォームでのポスター画像キャプチャに使う。
   */
  onReady?: (capture: () => string | null) => void;
}

const DRACO_DECODER = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

/**
 * GLB/GLTF ビューア。three.js + GLTFLoader(+DRACO) + OrbitControls + RoomEnvironment。
 * 自動回転（操作で恒久停止）、bounding box センタリング＆カメラフィット、リサイズ対応、
 * ローディング進捗、初回操作ヒント、全画面、右下3Dバッジ。
 */
export function GlbViewer({ url, onFallback, orientation, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showHint, setShowHint] = useState(true);
  // 最新の値を effect 内のクロージャから参照するための ref（再マウントを避ける）
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // ロード済み model を保持し、orientation 変化時に回転だけ更新する。
  const modelRef = useRef<{ rotation: { set: (x: number, y: number, z: number) => void } } | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);

  // orientation の適用（モデル再ロードなしで回転だけ更新）
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const [rx, ry, rz] = orientationToRadians(orientation);
    model.rotation.set(rx, ry, rz);
    requestRenderRef.current?.();
  }, [orientation, loaded]);

  useEffect(() => {
    let disposed = false;
    // クリーンアップ用ハンドル
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
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');

      if (disposed || !containerRef.current) return;

      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;

      // preserveDrawingBuffer: ポスター画像キャプチャ（toDataURL）で canvas が空に
      // ならないようにするため。
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      container.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';

      const scene = new THREE.Scene();

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
      camera.position.set(0, 0, 3);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.2;

      // 初回操作で自動回転を恒久停止＋ヒントを消す
      const stopAuto = () => {
        controls.autoRotate = false;
        setShowHint(false);
      };
      renderer.domElement.addEventListener('pointerdown', stopAuto, { once: true });
      renderer.domElement.addEventListener('touchstart', stopAuto, { once: true });

      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_DECODER);
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      let raf = 0;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
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

      loader.load(
        url,
        (gltf) => {
          if (disposed) return;
          const model = gltf.scene;

          // 向き補正を先に適用してから bounding box を取る（回転後の実寸でフィット）。
          const [rx, ry, rz] = orientationToRadians(orientation);
          model.rotation.set(rx, ry, rz);
          model.updateMatrixWorld(true);

          // bounding box センタリング＆カメラフィット
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          scene.add(model);
          modelRef.current = model;

          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const fov = (camera.fov * Math.PI) / 180;
          const dist = (maxDim / 2 / Math.tan(fov / 2)) * 1.6;
          camera.position.set(0, maxDim * 0.15, dist);
          camera.near = dist / 100;
          camera.far = dist * 100;
          camera.updateProjectionMatrix();
          controls.target.set(0, 0, 0);
          controls.update();

          // orientation effect / キャプチャから1フレーム描画を要求できるようにする。
          requestRenderRef.current = () => renderer.render(scene, camera);

          setLoaded(true);
          animate();

          // 親へポスター画像キャプチャ関数を渡す。
          onReadyRef.current?.(() => {
            try {
              renderer.render(scene, camera);
              return renderer.domElement.toDataURL('image/png');
            } catch {
              return null;
            }
          });
        },
        (ev) => {
          if (ev.total > 0) {
            setProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        },
        () => {
          if (!disposed) setError(true);
        }
      );

      cleanup = () => {
        cancelAnimationFrame(raf);
        modelRef.current = null;
        requestRenderRef.current = null;
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('pointerdown', stopAuto);
        renderer.domElement.removeEventListener('touchstart', stopAuto);
        controls.dispose();
        scene.traverse((obj) => {
          const mesh = obj as { geometry?: { dispose?: () => void }; material?: unknown };
          mesh.geometry?.dispose?.();
          const mat = mesh.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => (m as { dispose?: () => void }).dispose?.());
          } else if (mat) {
            (mat as { dispose?: () => void }).dispose?.();
          }
        });
        envTex.dispose();
        pmrem.dispose();
        dracoLoader.dispose();
        renderer.dispose();
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
        <p className="text-[14px] text-ink-sub">
          3Dモデルを表示できませんでした。
        </p>
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

      {/* ローディング */}
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-muted">
          <div className="text-[13px] font-medium text-ink-sub">
            3Dモデルを読み込み中… {progress > 0 ? `${progress}%` : ''}
          </div>
        </div>
      )}

      {/* 初回操作ヒント */}
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

      {/* 全画面ボタン */}
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

      {/* 右下3Dバッジ */}
      <div className="absolute bottom-3 right-3 flex h-[38px] w-[38px] items-center justify-center rounded-pill border-[1.5px] border-ink bg-white text-[11px] font-bold text-ink">
        3D
      </div>
    </div>
  );
}
