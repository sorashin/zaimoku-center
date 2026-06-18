-- 3Dモデルの向き補正プリセット。スキャンの上下逆さま・横倒しを出品時に正位置へ
-- 補正できるようにする。値は 'default' | 'flip' | 'rotateLeft' | 'rotateRight' | 'rotate180'。
alter table public.listings
  add column if not exists model_orientation text not null default 'default';
