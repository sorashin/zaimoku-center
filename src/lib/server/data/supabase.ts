import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Listing,
  ListingPhoto,
  ListingWithSeller,
  PurchaseRequest,
  Seller,
  Shape,
  ListingStatus,
  PriceUnit,
  ModelFormat,
} from '@/lib/types';
import type { DataLayer, CreateListingInput, UpdateListingInput, CreatePurchaseRequestInput } from './types';
import type { RuntimeEnv } from './index';

// ===== Supabase データ層（本実装） =====
// ※ アカウント未作成のため未検証。スキーマは supabase/migrations/0001_init.sql に対応。
// サーバー側からは service_role キーで読み書きする（RLS をバイパスし、所有チェックは
// API 層 + アプリロジックで担保。お気に入り・リクエストは userId を明示指定）。
//
// 秘匿値（SERVICE_ROLE_KEY）はビルド時バンドルへの焼き込みを避けるため、runtime env
// のみから読む（import.meta.env フォールバックを使わない）。ローカル dev でも
// platformProxy 経由で .env 値が runtime env に入る。SUPABASE_URL は公開可なので
// フォールバック可。

/**
 * runtime env から service_role の admin クライアントを生成する。
 * env はリクエストごとに渡されるため、モジュールスコープではキャッシュしない。
 */
function createAdminClient(env?: RuntimeEnv): SupabaseClient {
  const url = env?.SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
  // 秘匿: フォールバックなし（焼き込み防止）。
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ===== 行 → ドメイン型マッピング =====

interface ProfileRow {
  id: string;
  company_name: string | null;
  short_label: string | null;
  avatar_color: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  bio: string | null;
  display_name: string | null;
}

interface ListingRow {
  id: string;
  seller_id: string;
  title: string;
  species: string;
  shape: Shape;
  length_mm: number | null;
  width_mm: number | null;
  thickness_mm: number | null;
  stock: number;
  price: number;
  price_unit: PriceUnit;
  min_unit_label: string;
  status: ListingStatus;
  description: string | null;
  moisture: string | null;
  dryness: string | null;
  heartwood: string | null;
  knots: string | null;
  model_url: string | null;
  model_format: string | null;
  model_poster_url: string | null;
  posted_at: string;
  listing_photos?: { url: string; is_main: boolean; sort: number }[];
}

function toSeller(row: ProfileRow): Seller {
  return {
    id: row.id,
    companyName: row.company_name ?? row.display_name ?? '出品者',
    shortLabel: row.short_label ?? (row.company_name ?? '出品').slice(0, 2),
    avatarColor: row.avatar_color ?? '#6b4a2e',
    locationLabel: row.location_label ?? '',
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    bio: row.bio ?? undefined,
  };
}

function toPhotos(rows?: { url: string; is_main: boolean; sort: number }[]): ListingPhoto[] {
  if (!rows) return [];
  return [...rows]
    .sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.sort - b.sort)
    .map((p) => ({ url: p.url, isMain: p.is_main }));
}

function toListing(row: ListingRow): Listing {
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    species: row.species,
    shape: row.shape,
    lengthMm: row.length_mm ?? undefined,
    widthMm: row.width_mm ?? undefined,
    thicknessMm: row.thickness_mm ?? undefined,
    stock: row.stock,
    price: row.price,
    priceUnit: row.price_unit,
    minUnitLabel: row.min_unit_label,
    status: row.status,
    description: row.description ?? undefined,
    moisture: row.moisture ?? undefined,
    dryness: row.dryness ?? undefined,
    heartwood: row.heartwood ?? undefined,
    knots: row.knots ?? undefined,
    modelUrl: row.model_url ?? undefined,
    modelFormat: (row.model_format as ModelFormat | null) ?? undefined,
    modelPosterUrl: row.model_poster_url ?? undefined,
    photos: toPhotos(row.listing_photos),
    postedAt: row.posted_at,
  };
}

const LISTING_SELECT = '*, listing_photos(url, is_main, sort)';

// 出品者情報をまとめて引いて結合（N+1 回避）。
async function attachSellers(
  client: SupabaseClient,
  listings: Listing[]
): Promise<ListingWithSeller[]> {
  const ids = [...new Set(listings.map((l) => l.sellerId))];
  if (ids.length === 0) return [];
  const { data, error } = await client.from('profiles').select('*').in('id', ids);
  if (error) throw new Error(`profiles 取得失敗: ${error.message}`);
  const map = new Map<string, Seller>((data as ProfileRow[]).map((r) => [r.id, toSeller(r)]));
  return listings
    .map((l) => {
      const seller = map.get(l.sellerId);
      return seller ? { ...l, seller } : null;
    })
    .filter((x): x is ListingWithSeller => x !== null);
}

/**
 * runtime env を注入して Supabase データ層を生成するファクトリ。
 * リクエストごとに呼び、env から admin クライアントを構築する。
 */
export function createSupabaseDataLayer(env?: RuntimeEnv): DataLayer {
  const client = createAdminClient(env);
  const layer: DataLayer = {
  async getSellers() {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('role', 'seller');
    if (error) throw new Error(error.message);
    return (data as ProfileRow[]).map(toSeller);
  },

  async getSeller(id) {
    const { data, error } = await client.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toSeller(data as ProfileRow) : null;
  },

  async getListings(filter, sort) {
    let q = client.from('listings').select(LISTING_SELECT);
    q = q.eq('status', filter?.status ?? 'published');
    if (filter?.sellerId) q = q.eq('seller_id', filter.sellerId);
    if (filter?.sawnOnly && !filter.irregularOnly) q = q.eq('shape', 'sawn');
    if (filter?.irregularOnly && !filter.sawnOnly) q = q.eq('shape', 'irregular');
    if (sort === 'price_asc') q = q.order('price', { ascending: true });
    else q = q.order('posted_at', { ascending: false });

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    let listings = (data as ListingRow[]).map(toListing);
    // query（タイトル・樹種テキスト）はクライアント絞込のためサーバーでは厳密適用しない。
    if (filter?.query) {
      const qq = filter.query.trim().toLowerCase();
      if (qq) {
        listings = listings.filter((l) => `${l.title} ${l.species}`.toLowerCase().includes(qq));
      }
    }
    return attachSellers(client, listings);
  },

  async getListing(id) {
    const { data, error } = await client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const listing = toListing(data as ListingRow);
    const withSeller = await attachSellers(client, [listing]);
    return withSeller[0] ?? null;
  },

  async getSellerListings(sellerId, includeAll = false) {
    let q = client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('seller_id', sellerId)
      .order('posted_at', { ascending: false });
    if (!includeAll) q = q.eq('status', 'published');
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const listings = (data as ListingRow[]).map(toListing);
    return attachSellers(client, listings);
  },

  async getRelatedListings(listing, limit = 6) {
    const { data, error } = await client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'published')
      .neq('id', listing.id)
      .or(`seller_id.eq.${listing.sellerId},species.eq.${listing.species}`)
      .limit(limit);
    if (error) throw new Error(error.message);
    const listings = (data as ListingRow[]).map(toListing);
    // 同出品者を優先して並べ替え。
    listings.sort((a, b) => {
      const aw = a.sellerId === listing.sellerId ? 0 : 1;
      const bw = b.sellerId === listing.sellerId ? 0 : 1;
      return aw - bw;
    });
    return attachSellers(client, listings.slice(0, limit));
  },

  async createListing(input) {
    const { data, error } = await client
      .from('listings')
      .insert({
        seller_id: input.sellerId,
        title: input.title,
        species: input.species,
        shape: input.shape,
        length_mm: input.lengthMm ?? null,
        width_mm: input.widthMm ?? null,
        thickness_mm: input.thicknessMm ?? null,
        stock: input.stock,
        price: input.price,
        price_unit: input.priceUnit,
        min_unit_label: input.minUnitLabel,
        status: input.status,
        description: input.description ?? null,
        moisture: input.moisture ?? null,
        dryness: input.dryness ?? null,
        heartwood: input.heartwood ?? null,
        knots: input.knots ?? null,
        model_url: input.modelUrl ?? null,
        model_format: input.modelFormat ?? null,
        model_poster_url: input.modelPosterUrl ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await replacePhotos(client, id, input.photos);
    const result = await layer.getListing(id);
    if (!result) throw new Error('作成後の取得に失敗しました。');
    return result;
  },

  async updateListing(id, patch) {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.species !== undefined) row.species = patch.species;
    if (patch.shape !== undefined) row.shape = patch.shape;
    if (patch.lengthMm !== undefined) row.length_mm = patch.lengthMm ?? null;
    if (patch.widthMm !== undefined) row.width_mm = patch.widthMm ?? null;
    if (patch.thicknessMm !== undefined) row.thickness_mm = patch.thicknessMm ?? null;
    if (patch.stock !== undefined) row.stock = patch.stock;
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.priceUnit !== undefined) row.price_unit = patch.priceUnit;
    if (patch.minUnitLabel !== undefined) row.min_unit_label = patch.minUnitLabel;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.description !== undefined) row.description = patch.description ?? null;
    if (patch.moisture !== undefined) row.moisture = patch.moisture ?? null;
    if (patch.dryness !== undefined) row.dryness = patch.dryness ?? null;
    if (patch.heartwood !== undefined) row.heartwood = patch.heartwood ?? null;
    if (patch.knots !== undefined) row.knots = patch.knots ?? null;
    if (patch.modelUrl !== undefined) row.model_url = patch.modelUrl ?? null;
    if (patch.modelFormat !== undefined) row.model_format = patch.modelFormat ?? null;
    if (patch.modelPosterUrl !== undefined) row.model_poster_url = patch.modelPosterUrl ?? null;

    if (Object.keys(row).length > 0) {
      const { error } = await client.from('listings').update(row).eq('id', id);
      if (error) throw new Error(error.message);
    }
    if (patch.photos !== undefined) {
      await replacePhotos(client, id, patch.photos);
    }
    return layer.getListing(id);
  },

  async deleteListing(id) {
    const { error } = await client.from('listings').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  },

  async toggleFavorite(userId, listingId) {
    const { data, error } = await client
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId)
      .eq('listing_id', listingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      const { error: delErr } = await client
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('listing_id', listingId);
      if (delErr) throw new Error(delErr.message);
      return false;
    }
    const { error: insErr } = await client
      .from('favorites')
      .insert({ user_id: userId, listing_id: listingId });
    if (insErr) throw new Error(insErr.message);
    return true;
  },

  async getFavoriteIds(userId) {
    const { data, error } = await client
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return (data as { listing_id: string }[]).map((r) => r.listing_id);
  },

  async getFavoriteListings(userId) {
    const ids = await layer.getFavoriteIds(userId);
    if (ids.length === 0) return [];
    const { data, error } = await client
      .from('listings')
      .select(LISTING_SELECT)
      .in('id', ids)
      .eq('status', 'published');
    if (error) throw new Error(error.message);
    const listings = (data as ListingRow[]).map(toListing);
    return attachSellers(client, listings);
  },

  async createPurchaseRequest(input) {
    const { data, error } = await client
      .from('purchase_requests')
      .insert({
        listing_id: input.listingId,
        buyer_id: input.buyerId,
        qty: input.qty,
        estimated_total: input.estimatedTotal,
        message: input.message ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const row = data as {
      id: string;
      listing_id: string;
      buyer_id: string;
      qty: number;
      estimated_total: number;
      message: string | null;
      status: 'open' | 'closed';
      created_at: string;
    };
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      qty: row.qty,
      estimatedTotal: row.estimated_total,
      message: row.message ?? undefined,
      status: row.status,
      createdAt: row.created_at,
    } satisfies PurchaseRequest;
  },
  };
  return layer;
}

/** 写真を一括置換（編集時は既存削除→再挿入）。 */
async function replacePhotos(
  client: SupabaseClient,
  listingId: string,
  photos: ListingPhoto[]
): Promise<void> {
  await client.from('listing_photos').delete().eq('listing_id', listingId);
  if (photos.length === 0) return;
  const rows = photos.map((p, i) => ({
    listing_id: listingId,
    url: p.url,
    is_main: p.isMain,
    sort: i,
  }));
  const { error } = await client.from('listing_photos').insert(rows);
  if (error) throw new Error(`listing_photos 挿入失敗: ${error.message}`);
}

// 型輸入の未使用警告回避（型のみ参照）。
export type { CreateListingInput, UpdateListingInput, CreatePurchaseRequestInput };
