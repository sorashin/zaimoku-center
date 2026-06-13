// public/uploads の板材画像を各出品の追加写真（2枚目以降）として R2 へアップロードする。
//   yarn seed:photos
// 必要 env（.env）: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_BASE_URL
//
// 各 slug ごとに seed-photos/<slug>-2.jpg, -3.jpg ... のキーで PUT する。
// sharp で長辺1600pxの JPEG に変換して軽量化する。
// アップロード後の公開URLは seed-supabase.mjs の photos() が <slug>-N.jpg 規約で参照する。
//
// 注意: 初回投入は完了済み（R2 反映済み）。元素材 PNG はサイズが大きいためリポジトリから
// 削除してある。再実行する場合は ASSIGNMENT のファイルを public/uploads に戻すこと
// （見つからないファイルは skip される）。

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { AwsClient } from 'aws4fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- .env 読み込み（seed-supabase.mjs と同じ簡易パーサ） ---
const envPath = join(__dirname, '..', '.env');
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env が無ければ環境変数をそのまま使う */
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

const UPLOADS_DIR = join(__dirname, '..', 'public', 'uploads');

// uploads のファイル名（スペース・括弧あり）を番号で参照できるようにする。
const U = (n) => `ChatGPT Image Jun 13, 2026, 12_24_${n}.png`;

// 樹種の色味に合わせて各 slug へ板材画像を割り当てる（2枚目以降に入る）。
// seed-supabase.mjs の photos() が <slug>-2.jpg, -3.jpg ... を参照する規約に合わせる。
const ASSIGNMENT = {
  kaba: [U('13 PM (2)'), U('14 PM (4)')], // 明るい黄褐
  karamatsu: [U('13 PM (1)'), U('17 PM (8)')], // 赤褐
  akamatsu: [U('18 PM (10)'), U('15 PM (6)')], // 橙褐
  sugi: [U('15 PM (6)'), U('18 PM (10)')], // 赤茶
  hinoki: [U('13 PM (3)'), U('15 PM (7)')], // 淡黄白
  kuri: [U('17 PM (9)'), U('13 PM (2)')], // 黄褐
  udaikanba: [U('17 PM (9)'), U('15 PM (7)')], // 赤白2トーン
  hoonoki: [U('15 PM (7)'), U('14 PM (5)')], // 緑灰（不定形・3D）
  'magari-nara': [U('14 PM (5)'), U('15 PM (6)')], // 灰褐（不定形・3D）
};

const r2 = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: 'auto',
});

async function putJpeg(key, buf) {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const res = await r2.fetch(endpoint, {
    method: 'PUT',
    body: buf,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`R2 PUT 失敗 ${key} (${res.status}): ${detail}`);
  }
}

async function main() {
  let n = 0;
  for (const [slug, files] of Object.entries(ASSIGNMENT)) {
    let idx = 2; // 1枚目(main)は既存。追加は2番から。
    for (const fname of files) {
      const srcPath = join(UPLOADS_DIR, fname);
      let raw;
      try {
        raw = await readFile(srcPath);
      } catch {
        console.warn(`  skip (見つからない): ${fname}`);
        continue;
      }
      const jpeg = await sharp(raw)
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      const key = `seed-photos/${slug}-${idx}.jpg`;
      await putJpeg(key, jpeg);
      console.log(
        `  ✓ ${slug}-${idx}.jpg (${(jpeg.length / 1024).toFixed(0)} KB) <- ${fname}`
      );
      idx++;
      n++;
    }
  }
  console.log(`\n完了: ${n} 枚を R2 (${bucket}) の seed-photos/ にアップロード`);
  console.log(`公開URL例: ${publicBase}/seed-photos/kaba-2.jpg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
