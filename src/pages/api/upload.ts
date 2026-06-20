import type { APIRoute } from 'astro';
import { getSession } from '@/lib/server/session';
import { storeUpload, type UploadKind } from '@/lib/server/storage';
import { canManageListings } from '@/lib/permissions';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 写真 / 3Dモデルのアップロード（seller 限定）。
 * multipart: file=<File>, kind='photo'|'model'。
 * 返り値: { url }
 *
 * mock: public/uploads/ に node:fs 保存。
 * supabase: 写真→Supabase Storage / モデル→R2（サーバープロキシ）。
 * ※ Cloudflare Workers のボディ上限 100MB に注意（README 参照）。
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const session = await getSession({ locals, cookies, request });
  if (!session.user) return json({ error: 'unauthorized' }, 401);
  // seller（自分の出品）または admin（他人の出品の編集）が利用可能。
  if (!canManageListings(session.user)) return json({ error: 'forbidden' }, 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'invalid_form' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: 'file_required' }, 400);
  }

  const kindRaw = form.get('kind');
  const kind: UploadKind = kindRaw === 'model' ? 'model' : 'photo';

  const env = locals.runtime?.env;
  try {
    const stored = await storeUpload(file, kind, env);
    return json({ ok: true, url: stored.url }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upload_failed';
    console.error('[api/upload] 失敗:', message);
    return json({ error: 'upload_failed', message }, 400);
  }
};
