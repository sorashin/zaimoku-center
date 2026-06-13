-- ============================================================
-- 伊那材木センター 初期スキーマ
-- profiles / listings / listing_photos / favorites / purchase_requests
-- RLS + auth.users トリガ + Storage(photos バケット) ポリシー
-- ============================================================

-- ---------- 拡張 ----------
create extension if not exists "pgcrypto";

-- ---------- ENUM ----------
do $$ begin
  create type listing_shape as enum ('sawn', 'irregular');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_status as enum ('published', 'closed', 'sold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type price_unit as enum ('per_m3', 'per_item');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('buyer', 'seller', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('open', 'closed');
exception when duplicate_object then null; end $$;

-- ============================================================
-- profiles
--   auth.users と 1:1。role は管理者が seller を手動付与（デフォルト buyer）。
--   出品者情報（屋号・アイコン・所在地）も profiles に統合。
-- ============================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          user_role not null default 'buyer',
  display_name  text not null default '名称未設定',
  -- 出品者プロフィール（seller のみ実質使用）
  company_name  text,
  short_label   text,            -- 丸アイコン用2文字
  avatar_color  text default '#6b4a2e',
  location_label text,           -- 例: 長野県伊那市
  lat           double precision,
  lng           double precision,
  bio           text,
  -- 連絡先（購入リクエスト通知用）
  contact_email text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- listings
-- ============================================================
create table if not exists public.listings (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references public.profiles(id) on delete cascade,
  title          text not null,
  species        text not null,
  shape          listing_shape not null default 'sawn',
  length_mm      integer,
  width_mm       integer,
  thickness_mm   integer,
  stock          integer not null default 1,
  price          integer not null,
  price_unit     price_unit not null default 'per_m3',
  min_unit_label text not null default '1本からOK',
  status         listing_status not null default 'published',
  description    text,
  moisture       text,
  dryness        text,
  heartwood      text,
  knots          text,
  model_url      text,
  model_format   text,           -- 'glb' | 'splat'
  model_poster_url text,         -- 3Dモデルのプレビュー画像（一覧サムネ用）
  posted_at      timestamptz not null default now()
);

create index if not exists listings_seller_idx on public.listings(seller_id);
create index if not exists listings_status_idx on public.listings(status);
create index if not exists listings_posted_idx on public.listings(posted_at desc);

-- ============================================================
-- listing_photos
-- ============================================================
create table if not exists public.listing_photos (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  url        text not null,
  sort       integer not null default 0,
  is_main    boolean not null default false
);

create index if not exists listing_photos_listing_idx on public.listing_photos(listing_id);

-- ============================================================
-- favorites
-- ============================================================
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ============================================================
-- purchase_requests
-- ============================================================
create table if not exists public.purchase_requests (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references public.listings(id) on delete cascade,
  buyer_id         uuid not null references public.profiles(id) on delete cascade,
  qty              integer not null default 1,
  estimated_total  integer not null default 0,
  message          text,
  status           request_status not null default 'open',
  created_at       timestamptz not null default now()
);

create index if not exists purchase_requests_listing_idx on public.purchase_requests(listing_id);
create index if not exists purchase_requests_buyer_idx on public.purchase_requests(buyer_id);

-- ============================================================
-- auth.users トリガ: 新規ユーザー作成時に profiles を自動作成（role=buyer）
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, contact_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), '名称未設定'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.favorites enable row level security;
alter table public.purchase_requests enable row level security;

-- ---------- profiles ----------
-- 公開列（出品者カード表示用）は誰でも読める。本人は自分の行を更新可。
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- listings ----------
-- published は全員 SELECT 可。自分の行は seller が全ステータス参照＋CRUD。
drop policy if exists "listings_select_published" on public.listings;
create policy "listings_select_published" on public.listings
  for select using (status = 'published' or seller_id = auth.uid());

drop policy if exists "listings_insert_owner" on public.listings;
create policy "listings_insert_owner" on public.listings
  for insert with check (
    seller_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'seller'
    )
  );

drop policy if exists "listings_update_owner" on public.listings;
create policy "listings_update_owner" on public.listings
  for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

drop policy if exists "listings_delete_owner" on public.listings;
create policy "listings_delete_owner" on public.listings
  for delete using (seller_id = auth.uid());

-- ---------- listing_photos ----------
-- 親 listing が見えるなら写真も見える。所有者のみ書き込み。
drop policy if exists "listing_photos_select" on public.listing_photos;
create policy "listing_photos_select" on public.listing_photos
  for select using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'published' or l.seller_id = auth.uid())
    )
  );

drop policy if exists "listing_photos_write" on public.listing_photos;
create policy "listing_photos_write" on public.listing_photos
  for all using (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  );

-- ---------- favorites ----------
-- 本人のみ全操作。
drop policy if exists "favorites_own" on public.favorites;
create policy "favorites_own" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- purchase_requests ----------
-- 買い手本人は自分の作成・参照可。出品者は自分の listing 宛のリクエストを参照可。
drop policy if exists "requests_insert_self" on public.purchase_requests;
create policy "requests_insert_self" on public.purchase_requests
  for insert with check (buyer_id = auth.uid());

drop policy if exists "requests_select_party" on public.purchase_requests;
create policy "requests_select_party" on public.purchase_requests
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  );

-- ============================================================
-- Storage: photos バケット
--   ※ サーバー（service_role）からアップロードするため書き込みは service_role に限定。
--     公開読み取りを許可（一覧・詳細で直リンク表示）。
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'photos');

-- 認証済みユーザーの書き込みを許可（API は service_role 経由だが、
-- クライアント直アップロードに切り替える場合に備えて authenticated も許可）。
drop policy if exists "photos_auth_write" on storage.objects;
create policy "photos_auth_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');
