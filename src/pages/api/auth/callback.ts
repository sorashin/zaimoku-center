import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

export const prerender = false;

/**
 * OAuth / メール確認のコールバック。
 * Supabase は ?code=... を返すので exchangeCodeForSession でセッション cookie を確立する。
 * ※ アカウント未作成のため未検証。
 */
export const GET: APIRoute = async ({ url, cookies, request, redirect, locals }) => {
  const code = url.searchParams.get('code');
  const rawRedirect = url.searchParams.get('redirect') ?? '/';
  const target =
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  const client = await createSupabaseServerClient(
    request.headers.get('cookie'),
    cookies,
    locals.runtime?.env
  );
  if (!client || !code) {
    return redirect('/login', 303);
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession 失敗:', error.message);
    return redirect('/login', 303);
  }
  return redirect(target, 303);
};
