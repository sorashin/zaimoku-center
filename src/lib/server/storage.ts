// アップロードストレージ抽象。
// mock: node:fs で public/uploads/ に保存（ローカル dev 専用）。
// supabase: 写真は Supabase Storage（photos バケット）、3Dモデルは Cloudflare R2 へ
//           サーバープロキシ（aws4fetch で S3 互換 PUT）。
//
// ※ Cloudflare Workers のリクエストボディ上限は 100MB。50MB 超のモデルファイルは
//   この上限に注意（README 参照）。本実装ではサーバープロキシ方式に統一している。

import { nanoid } from 'nanoid';
import { getDataMode } from './data';

/** 写真 / 3Dモデルの種別 */
export type UploadKind = 'photo' | 'model';

export interface StoredFile {
  /** 公開URL（mock: /uploads/xxx, supabase: Storage/R2 公開URL） */
  url: string;
}

/** 拡張子（先頭ドットなし）を安全に取り出す。許可リスト外は空文字。 */
function safeExt(filename: string, allowed: string[]): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const ext = m ? m[1]!.toLowerCase() : '';
  return allowed.includes(ext) ? ext : '';
}

const PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
const MODEL_EXT = ['glb', 'gltf', 'ply', 'splat', 'ksplat'];

/** 種別ごとの許可拡張子 */
export function allowedExtensions(kind: UploadKind): string[] {
  return kind === 'photo' ? PHOTO_EXT : MODEL_EXT;
}

/**
 * ファイルを保存し、公開URLを返す。
 * @param file アップロードされた File（multipart）
 * @param kind 'photo' | 'model'
 * @param env supabase モードで必要な環境変数（Astro.locals.runtime.env など）。mock では未使用。
 */
export async function storeUpload(
  file: File,
  kind: UploadKind,
  env?: Record<string, string | undefined>
): Promise<StoredFile> {
  const ext = safeExt(file.name, allowedExtensions(kind));
  if (!ext) {
    throw new Error(`許可されていないファイル形式です: ${file.name}`);
  }
  const key = `${nanoid()}.${ext}`;

  if (getDataMode(env) === 'mock') {
    return storeMock(file, key);
  }
  return kind === 'photo' ? storeSupabasePhoto(file, key, env) : storeR2Model(file, key, ext, env);
}

// ===== mock: node:fs で public/uploads/ に保存 =====

async function storeMock(file: File, key: string): Promise<StoredFile> {
  // mock はローカル dev 専用。動的 import で Cloudflare ビルド時の node:fs バンドルを避ける。
  const { writeFile, mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.resolve(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, key), buf);
  return { url: `/uploads/${key}` };
}

// ===== supabase: 写真は Supabase Storage（photos バケット） =====

async function storeSupabasePhoto(
  file: File,
  key: string,
  env?: Record<string, string | undefined>
): Promise<StoredFile> {
  const supabaseUrl = env?.SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
  // 秘匿: SERVICE_ROLE_KEY は runtime env のみ（焼き込み防止）。
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from('photos').upload(key, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase Storage アップロード失敗: ${error.message}`);
  }
  const { data } = admin.storage.from('photos').getPublicUrl(key);
  return { url: data.publicUrl };
}

// ===== supabase: 3Dモデルは Cloudflare R2（S3互換, aws4fetch でPUT） =====

async function storeR2Model(
  file: File,
  key: string,
  _ext: string,
  env?: Record<string, string | undefined>
): Promise<StoredFile> {
  const accountId = env?.R2_ACCOUNT_ID ?? import.meta.env.R2_ACCOUNT_ID;
  // 秘匿: R2 アクセスキー / シークレットは runtime env のみ（焼き込み防止）。
  const accessKeyId = env?.R2_ACCESS_KEY_ID;
  const secretAccessKey = env?.R2_SECRET_ACCESS_KEY;
  const bucket = env?.R2_BUCKET ?? import.meta.env.R2_BUCKET;
  const publicBase = env?.R2_PUBLIC_BASE_URL ?? import.meta.env.R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    throw new Error('R2_* 環境変数が未設定です。');
  }

  const { AwsClient } = await import('aws4fetch');
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const res = await client.fetch(endpoint, {
    method: 'PUT',
    body: await file.arrayBuffer(),
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`R2 アップロード失敗 (${res.status}): ${detail}`);
  }
  // 公開URLは R2 のパブリックバケット or カスタムドメイン経由。
  const base = publicBase.replace(/\/$/, '');
  return { url: `${base}/${key}` };
}
