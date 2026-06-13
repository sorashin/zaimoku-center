import type { AstroCookies } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';

// @supabase/ssr 用の cookie アダプタ。
// AstroCookies には getAll が無いため、リクエストの Cookie ヘッダから全 cookie を読み取り、
// 書き込みは AstroCookies.set/delete を使う。
// ※ アカウント未作成のため未検証。

function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header) return [];
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return { name: part, value: '' };
      return {
        name: part.slice(0, eq).trim(),
        value: decodeURIComponent(part.slice(eq + 1).trim()),
      };
    });
}

/**
 * リクエストコンテキストから @supabase/ssr のサーバークライアントを生成する。
 * @param cookieHeader request.headers.get('cookie')
 * @param cookies AstroCookies（書き込み用）
 * @param env Cloudflare runtime env（Astro.locals.runtime.env）。未取得時は import.meta.env にフォールバック。
 *
 * SUPABASE_URL / SUPABASE_ANON_KEY はいずれも公開可（anon キーはクライアント公開前提）
 * のため、import.meta.env フォールバックを許容する。
 */
export async function createSupabaseServerClient(
  cookieHeader: string | null,
  cookies: AstroCookies,
  env?: Record<string, string | undefined>
): Promise<SupabaseClient | null> {
  const url = env?.SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
  const anonKey = env?.SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const { createServerClient } = await import('@supabase/ssr');
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader);
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          if (value === '') {
            cookies.delete(name, { ...options, path: '/' });
          } else {
            cookies.set(name, value, { ...options, path: '/' });
          }
        }
      },
    },
  });
}
