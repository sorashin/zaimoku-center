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
  /** カートまとめ購入リクエストの通知先（Google Apps Script Web App の URL） */
  readonly GAS_WEBHOOK_URL?: string;
  /** GAS Web App の簡易認証用共有トークン（任意。GAS 側のスクリプトプロパティと照合） */
  readonly GAS_WEBHOOK_TOKEN?: string;
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
