#!/usr/bin/env node
/**
 * 3D Gaussian Splatting の .ply を配信用 .ksplat に圧縮変換する。
 *
 * .ksplat は @mkkellogg/gaussian-splats-3d 専用のコンパクト形式。
 * SH 次数を落とし、位置/色/スケール/回転を量子化（compressionLevel=1: 16bit）
 * することで、生 PLY の 1/4〜1/5 に縮む。実行時パースも不要になりロードが速い。
 *
 * 使い方:
 *   node scripts/convert-splat.mjs <input.ply> [output.ksplat] [--sh 0|1|2] [--alpha 1]
 *
 * 例:
 *   node scripts/convert-splat.mjs '/path/to/高遠町山室.ply' public/models/takato-yamamuro.ksplat
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

// @mkkellogg/gaussian-splats-3d はブラウザ前提（window.setTimeout 等）のため、
// Node でヘッドレス変換するための最小シムを注入する。
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.window.setTimeout === 'undefined') {
  globalThis.window.setTimeout = setTimeout;
  globalThis.window.clearTimeout = clearTimeout;
}
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement: () => ({}), body: { appendChild() {} } };
}

function parseArgs(argv) {
  const positional = [];
  const opts = { sh: 0, alpha: 1, compression: 1, optimize: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sh') opts.sh = Number(argv[(i += 1)]);
    else if (a === '--alpha') opts.alpha = Number(argv[(i += 1)]);
    else if (a === '--compression') opts.compression = Number(argv[(i += 1)]);
    else if (a === '--no-optimize') opts.optimize = false;
    else positional.push(a);
  }
  return { positional, opts };
}

function fmtBytes(n) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const input = positional[0];
  if (!input) {
    console.error('使い方: node scripts/convert-splat.mjs <input.ply> [output.ksplat] [--sh 0|1|2]');
    process.exit(1);
  }
  const output =
    positional[1] || `${basename(input, extname(input))}.ksplat`;

  const plyBuf = await readFile(input);
  // ArrayBuffer として渡す（ライブラリは ArrayBuffer を期待）
  const plyArrayBuffer = plyBuf.buffer.slice(
    plyBuf.byteOffset,
    plyBuf.byteOffset + plyBuf.byteLength
  );

  const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');

  const splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(
    plyArrayBuffer,
    opts.alpha, // minimumAlpha: これ未満の透明スプラットを除去
    opts.compression, // compressionLevel: 1 = 16bit 量子化
    opts.optimize, // optimizeSplatData: 空間ソート/バケット最適化
    opts.sh // outSphericalHarmonicsDegree
  );

  // SplatBuffer.bufferData が .ksplat のバイト列そのもの（downloadFile も同じ）
  const ksplatData = splatBuffer.bufferData;

  const outBytes = ksplatData.byteLength ?? ksplatData.length;
  await writeFile(output, Buffer.from(ksplatData));

  const inSize = plyBuf.byteLength;
  console.log(
    `✓ ${basename(input)} (${fmtBytes(inSize)}) → ${output} (${fmtBytes(
      outBytes
    )})  SH${opts.sh}  圧縮率 ${((1 - outBytes / inSize) * 100).toFixed(0)}%`
  );
}

main().catch((e) => {
  console.error('変換失敗:', e);
  process.exit(1);
});
