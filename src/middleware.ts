import { defineMiddleware } from 'astro:middleware';
import { resolveSession } from '@/lib/server/session';

/**
 * セッションをリクエストごとに一度だけ解決し、Astro.locals.session に載せる。
 *
 * これをミドルウェアで行う理由:
 * supabase モードでは @supabase/ssr が getUser() 時にアクセストークンを
 * 自動リフレッシュし、新しいトークンを cookie へ書き戻す。各ページのフロントマターで
 * 個別に呼ぶと、レスポンスのストリーミング開始後に cookie.set が走り
 * `ResponseSentError` になりうる。ミドルウェアはレスポンス生成の前段で完結するため、
 * cookie 書き戻しを安全に確定できる。
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.session = await resolveSession(
    context.cookies,
    context.request,
    context.locals.runtime?.env
  );
  return next();
});
