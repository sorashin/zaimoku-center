-- 0001 の初回適用時に listings.model_poster_url が反映されなかったケースの補正。
-- （3Dモデルのプレビュー画像URL。一覧サムネ用）
alter table public.listings
  add column if not exists model_poster_url text;
