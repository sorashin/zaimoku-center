// 3Dモデル（.ksplat / .glb / .ply など）を Cloudflare R2 へアップロードする汎用CLI。
//
//   node scripts/upload-model.mjs <file> [key]
//
// key を省略するとファイル名がそのまま models/<filename> のキーになる。
// 公開URL（R2_PUBLIC_BASE_URL/<key>）を出力するので、それを出品の modelUrl に設定する。
//
// 必要 env（.env）: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
//                   / R2_BUCKET / R2_PUBLIC_BASE_URL
//
// 例:
//   node scripts/upload-model.mjs public/models/takato-yamamuro.ksplat
//     → models/takato-yamamuro.ksplat にPUT

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname } from 'node:path';
import { AwsClient } from 'aws4fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- .env 読み込み（他の seed スクリプトと同じ簡易パーサ） ---
const envPath = join(__dirname, '..', '.env');
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // .env が無ければ環境変数に委ねる
}

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicBase = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
  console.error('R2_* 環境変数が未設定です（.env を確認）。');
  process.exit(1);
}

// 拡張子 → Content-Type
const MIME = {
  '.ksplat': 'application/octet-stream',
  '.splat': 'application/octet-stream',
  '.ply': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const r2 = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: 'auto',
});

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('使い方: node scripts/upload-model.mjs <file> [key]');
    process.exit(1);
  }
  const ext = extname(input).toLowerCase();
  const key = process.argv[3] || `models/${basename(input)}`;
  const body = await readFile(input);
  const contentType = MIME[ext] || 'application/octet-stream';

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const res = await r2.fetch(endpoint, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': contentType,
      // R2 のパブリックバケット配信。CDN/ブラウザに長期キャッシュさせる。
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`R2 PUT 失敗 ${key} (${res.status}): ${detail}`);
  }

  const url = `${publicBase}/${key}`;
  console.log(
    `✓ ${basename(input)} (${(body.length / 1024 / 1024).toFixed(1)}MB) → ${key}`
  );
  console.log(`  公開URL: ${url}`);
  console.log(`  → 出品の modelUrl にこのURL、modelFormat は拡張子から自動判定されます。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
