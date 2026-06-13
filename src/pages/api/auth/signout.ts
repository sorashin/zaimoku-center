import type { APIRoute } from 'astro';
import type { AstroCookies } from 'astro';
import { DEMO_COOKIE } from '@/lib/server/session';
import { getDataMode } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

export const prerender = false;

async function signOut(
  cookies: AstroCookies,
  request: Request,
  env?: Record<string, string | undefined>
): Promise<void> {
  if (getDataMode(env) === 'mock') {
    cookies.delete(DEMO_COOKIE, { path: '/' });
    return;
  }
  const client = await createSupabaseServerClient(request.headers.get('cookie'), cookies, env);
  if (client) await client.auth.signOut();
}

export const POST: APIRoute = async ({ cookies, request, redirect, locals }) => {
  await signOut(cookies, request, locals.runtime?.env);
  return redirect('/', 303);
};

export const GET: APIRoute = async ({ cookies, request, redirect, locals }) => {
  await signOut(cookies, request, locals.runtime?.env);
  return redirect('/', 303);
};
