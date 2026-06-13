#!/usr/bin/env node
// 3Dモデル（GLB）から一覧サムネ用のプレビュー画像（PNG）を public/models/ に生成する。
// puppeteer の headless Chrome 上で three.js を使い、詳細ページの GlbViewer と同じ
// 描画設定（RoomEnvironment / ACESトーンマッピング / bounding box フィット）でレンダリングする。
//
// 使い方: node scripts/generate-model-posters.mjs
// seed.ts の modelPosterUrl と対応させること（<name>.glb -> <name>.png）。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname } from 'node:path';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, '..', 'public', 'models');

// 出力サイズ（カードは正方形サムネなので 1:1。Retina 用に 2x 相当）
const SIZE = 1024;
// three.js / アドオンの CDN（GlbViewer と同じ DRACO デコーダを使う）
const THREE_VERSION = '0.169.0';
const DRACO_DECODER = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

/** 1つの GLB をレンダリングして PNG バッファを返す */
async function renderGlb(page, glbBase64) {
  const dataUrl = `data:model/gltf-binary;base64,${glbBase64}`;

  const result = await page.evaluate(
    async (modelDataUrl, size, dracoPath) => {
      // importmap（ページに注入済み）の "three" / "three/addons/" 経由で解決する。
      // GLTFLoader 等が内部で bare specifier "three" を import するため必須。
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
      const { RoomEnvironment } = await import(
        'three/addons/environments/RoomEnvironment.js'
      );

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(1);
      renderer.setSize(size, size);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);

      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(dracoPath);
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      const gltf = await loader.loadAsync(modelDataUrl);
      const model = gltf.scene;

      // bounding box センタリング＆カメラフィット（GlbViewer と同じ式）
      const box = new THREE.Box3().setFromObject(model);
      const meshSize = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      scene.add(model);

      const maxDim = Math.max(meshSize.x, meshSize.y, meshSize.z) || 1;
      const fov = (camera.fov * Math.PI) / 180;
      const dist = (maxDim / 2 / Math.tan(fov / 2)) * 1.6;
      // サムネは少し斜め上から見下ろす定番アングル
      camera.position.set(dist * 0.55, maxDim * 0.35, dist * 0.85);
      camera.near = dist / 100;
      camera.far = dist * 100;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    dataUrl,
    SIZE,
    DRACO_DECODER
  );

  const b64 = result.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(b64, 'base64');
}

async function main() {
  const entries = await readdir(MODELS_DIR);
  const glbs = entries.filter((f) => extname(f).toLowerCase() === '.glb');
  if (glbs.length === 0) {
    console.log('GLB が見つかりませんでした:', MODELS_DIR);
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SIZE, height: SIZE });

    // importmap を含む最小ページを読み込む。bare specifier "three" / "three/addons/"
    // を unpkg の ESM ビルドへ解決させる。importmap は最初の動的 import より前に
    // DOM へ存在する必要があるため setContent で先に注入する。
    const base = `https://unpkg.com/three@${THREE_VERSION}`;
    const html = `<!doctype html><html><head>
      <script type="importmap">
      {
        "imports": {
          "three": "${base}/build/three.module.js",
          "three/addons/": "${base}/examples/jsm/"
        }
      }
      </script>
    </head><body></body></html>`;
    // about:blank だと importmap が無視されるため、実オリジンを base に持たせる
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    let n = 0;
    for (const glb of glbs) {
      const name = basename(glb, extname(glb));
      const glbBuf = await readFile(join(MODELS_DIR, glb));
      const png = await renderGlb(page, glbBuf.toString('base64'));
      const outPath = join(MODELS_DIR, `${name}.png`);
      await writeFile(outPath, png);
      console.log(`生成: ${glb} -> ${name}.png (${(png.length / 1024).toFixed(0)} KB)`);
      n++;
    }
    console.log(`完了: ${n} 件のプレビューを生成 -> ${MODELS_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
