import type { DataLayer } from './types';
import { mockDataLayer } from './mock';
import { createSupabaseDataLayer } from './supabase';

export type { DataLayer } from './types';
export type {
  CreateListingInput,
  UpdateListingInput,
  CreatePurchaseRequestInput,
} from './types';

/** ランタイム環境変数（Cloudflare runtime env / フォールバックで import.meta.env）。 */
export type RuntimeEnv = Record<string, string | undefined> | undefined;

/**
 * DATA_MODE（既定 mock）でデータ層モードを決定。
 * runtime env を優先し、未取得時のみ import.meta.env にフォールバック。
 * DATA_MODE は公開可（秘匿値ではない）なのでフォールバック可。
 */
export function getDataMode(env?: RuntimeEnv): 'mock' | 'supabase' {
  const mode = env?.DATA_MODE ?? import.meta.env.DATA_MODE;
  return mode === 'supabase' ? 'supabase' : 'mock';
}

/**
 * リクエストごとに env を見てデータ層を解決する唯一の入口。
 * mock は env 不要のシングルトン、supabase は env を注入したファクトリを返す。
 * モジュールロード時にモードを確定させない（秘匿値の焼き込み防止）。
 */
export function getData(env?: RuntimeEnv): DataLayer {
  return getDataMode(env) === 'supabase' ? createSupabaseDataLayer(env) : mockDataLayer;
}
