// ブラウザ内で 3D Gaussian Splatting の .ply を配信用 .ksplat に圧縮する。
//
// 出品フォームで重い .ply（数十MB）を選んだとき、アップロード前にクライアントで
// .ksplat（SH0, 16bit量子化）へ変換し、転送量と配信サイズを 1/4〜1/10 に減らす。
// ライブラリ（@mkkellogg/gaussian-splats-3d）は元々ブラウザ用なので、ここでは
// Node 変換スクリプト（scripts/convert-splat.mjs）のような window シムは不要。

/** PLY ヘッダを見て 3D Gaussian Splatting 形式か判定する（先頭だけ読む） */
export async function isGaussianSplatPly(file: File): Promise<boolean> {
  // ヘッダは先頭数KB に収まる。f_dc_* / scale_* / rot_* があれば splat とみなす。
  const head = await file.slice(0, 4096).text();
  if (!/^ply/.test(head)) return false;
  return /property\s+float\s+f_dc_0/.test(head) || /property\s+float\s+scale_0/.test(head);
}

export interface CompressResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
}

/**
 * Gaussian Splatting の .ply（File）を .ksplat（File）に変換して返す。
 * @param file        入力 .ply
 * @param shDegree    出力 SH 次数（0=最軽量, 1, 2）。既定 0。
 * @param onProgress  進捗（0..1）。パース自体は進捗を持たないため概算。
 */
export async function compressPlyToKsplat(
  file: File,
  shDegree = 0
): Promise<CompressResult> {
  const arrayBuffer = await file.arrayBuffer();
  const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');

  // loadFromFileData(plyData, minimumAlpha, compressionLevel, optimizeSplatData, outSHDegree)
  //   minimumAlpha=1     : ほぼ透明なスプラットを除去
  //   compressionLevel=1 : 16bit 量子化
  //   optimizeSplatData  : 空間ソート/バケット最適化（描画も速くなる）
  const splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(
    arrayBuffer,
    1,
    1,
    true,
    shDegree
  );

  const data: ArrayBuffer = splatBuffer.bufferData;
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const ksplat = new File([data], `${baseName}.ksplat`, {
    type: 'application/octet-stream',
  });

  return {
    file: ksplat,
    originalBytes: file.size,
    compressedBytes: ksplat.size,
  };
}
