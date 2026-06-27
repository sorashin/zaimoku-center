/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly DATA_MODE?: 'mock' | 'supabase';
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly R2_ACCOUNT_ID?: string;
  readonly R2_ACCESS_KEY_ID?: string;
  readonly R2_SECRET_ACCESS_KEY?: string;
  readonly R2_BUCKET?: string;
  readonly R2_PUBLIC_BASE_URL?: string;
  readonly RESEND_API_KEY?: string;
  /** まとめ購入リクエストの通知先（運営アドレス） */
  readonly ADMIN_NOTIFY_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Cloudflare Workers/Pages のランタイム環境変数（@astrojs/cloudflare が Astro.locals.runtime に注入）。 */
type CloudflareEnv = Record<string, string | undefined>;

declare namespace App {
  interface Locals {
    runtime?: {
      env: CloudflareEnv;
    };
    /** ミドルウェアが解決したセッション（getSession 経由で参照する） */
    session?: import('@/lib/types').Session;
  }
}
