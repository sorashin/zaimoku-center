-- ============================================================
-- 出品バリエーション（厚み・幅・長さ・在庫・価格パターン）対応
--   listing_variants を追加。1つの listing に複数の寸法・在庫・価格パターンを紐付ける。
--   listings 側の length/width/thickness/stock/price/price_unit は後方互換のため残し、
--   「先頭パターンの寸法・在庫合計・最安価格」をアプリ層からミラー保存する。
--
--   ※ 破壊的変更は一切行わない（列削除・型変更・DELETE なし）。
--     既存テーブルへの追加（purchase_requests.variant_id）と新規テーブル作成、
--     既存データの 1パターンへのコピー（INSERT）のみ。
-- ============================================================

-- ---------- listing_variants ----------
create table if not exists public.listing_variants (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  length_mm    integer,
  width_mm     integer,
  thickness_mm integer,
  stock        integer not null default 1,
  price        integer not null default 0,
  price_unit   price_unit not null default 'per_m3',
  label        text,             -- 任意の表示名（無ければ寸法から自動生成）
  sort         integer not null default 0,  -- 表示順。0=デフォルト
  created_at   timestamptz not null default now()
);

create index if not exists listing_variants_listing_idx on public.listing_variants(listing_id);

-- ---------- purchase_requests に variant_id（任意） ----------
-- どのパターンに対するリクエストかを記録。既存行は NULL のまま（後方互換）。
alter table public.purchase_requests
  add column if not exists variant_id uuid references public.listing_variants(id) on delete set null;

-- ============================================================
-- RLS（listing_photos と同型: 親 listing が見えれば見える / 所有者のみ書込）
-- ============================================================
alter table public.listing_variants enable row level security;

drop policy if exists "listing_variants_select" on public.listing_variants;
create policy "listing_variants_select" on public.listing_variants
  for select using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'published' or l.seller_id = auth.uid())
    )
  );

drop policy if exists "listing_variants_write" on public.listing_variants;
create policy "listing_variants_write" on public.listing_variants
  for all using (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  );

-- ============================================================
-- 既存データ移行: sawn の listing を 1パターンへコピー（冪等）
--   既に variants を持つ listing はスキップ（再実行しても重複しない）。
-- ============================================================
insert into public.listing_variants (listing_id, length_mm, width_mm, thickness_mm, stock, price, price_unit, sort)
select l.id, l.length_mm, l.width_mm, l.thickness_mm, l.stock, l.price, l.price_unit, 0
from public.listings l
where l.shape = 'sawn'
  and not exists (
    select 1 from public.listing_variants v where v.listing_id = l.id
  );
