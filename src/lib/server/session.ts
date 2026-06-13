import type { AstroCookies } from 'astro';
import type { Session, SessionUser, UserRole } from '@/lib/types';
import { getDataMode } from './data';
import { createSupabaseServerClient } from './supabaseServer';

export const DEMO_COOKIE = 'demo_user';

/** mock モードのデモユーザー定義 */
const DEMO_USERS: Record<string, SessionUser> = {
  'buyer-demo': {
    id: 'buyer-demo',
    name: 'デモ買い手',
    role: 'buyer',
  },
  'seller-morimoku': {
    id: 'seller-morimoku',
    name: '盛木材',
    role: 'seller',
    sellerProfile: { sellerId: 'seller-morimoku' },
  },
};

export type DemoUserKey = keyof typeof DEMO_USERS;

export function isDemoUserKey(value: string): value is DemoUserKey {
  return value in DEMO_USERS;
}

/**
 * リクエストの cookie からセッションを解決する（ミドルウェア専用の実処理）。
 * mock: cookie `demo_user`。supabase: @supabase/ssr の cookie フロー + profiles から role 取得。
 *
 * supabase モードのトークンリフレッシュは cookie 書き戻しを伴うため、必ず
 * レスポンス生成前のミドルウェア段階で一度だけ呼ぶこと（ResponseSentError 回避）。
 */
export async function resolveSession(
  cookies: AstroCookies,
  request?: Request,
  env?: Record<string, string | undefined>
): Promise<Session> {
  if (getDataMode(env) === 'mock') {
    const key = cookies.get(DEMO_COOKIE)?.value;
    if (key && isDemoUserKey(key)) {
      return { user: DEMO_USERS[key]! };
    }
    return { user: null };
  }
  return getSupabaseSession(cookies, request?.headers.get('cookie') ?? null, env);
}

/**
 * ページ / API エンドポイントからセッションを取得する唯一の入口。
 * ミドルウェアが事前に解決して locals.session に載せているのでそれを返す。
 * （未設定時のフォールバックとして resolveSession も呼ぶ）
 */
export async function getSession(context: {
  locals: App.Locals;
  cookies: AstroCookies;
  request: Request;
}): Promise<Session> {
  if (context.locals.session) return context.locals.session;
  return resolveSession(context.cookies, context.request, context.locals.runtime?.env);
}

// ===== supabase モード =====
// ※ アカウント未作成のため未検証。@supabase/ssr の createServerClient で cookie から
//   セッションを復元し、profiles から role / seller プロフィールを取得する。

async function getSupabaseSession(
  cookies: AstroCookies,
  cookieHeader: string | null,
  env?: Record<string, string | undefined>
): Promise<Session> {
  const client = await createSupabaseServerClient(cookieHeader, cookies, env);
  if (!client) return { user: null };

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { user: null };

  // profiles から role / 出品者プロフィールを取得。
  const { data: profile } = await client
    .from('profiles')
    .select('id, role, display_name, company_name')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? 'buyer';
  const name =
    (profile?.company_name as string | null) ??
    (profile?.display_name as string | null) ??
    user.email ??
    'ユーザー';

  // ソーシャルログイン（Google等）のプロフィール画像。provider により key が異なる。
  const meta = user.user_metadata ?? {};
  const avatarUrl =
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined) ??
    undefined;

  const sessionUser: SessionUser = {
    id: user.id,
    name,
    role,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(role === 'seller' ? { sellerProfile: { sellerId: user.id } } : {}),
  };
  return { user: sessionUser };
}
