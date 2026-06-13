# 伊那材木センター

地域材・不採算木材を3Dスキャンで「一本ずつの価値」として可視化し、取引につなげるマーケットプレイス。
出品者（材木屋・製材所・森林組合）が回せる3Dモデルと写真で在庫を出品し、買い手（木工職人・家具作家・建築家・DIYユーザー）が探して購入リクエストを送る。

- **一覧** `/` — カードグリッド＋マップ（デスクトップ分割 / モバイルトグル）、検索・フィルタ・ソート
- **詳細** `/items/[id]` — 3Dビューア主役、スペック表、出品者カード、所在地ミニマップ、関連在庫、購入リクエスト
- **出品** `/sell` — 出品フォーム（3Dモデル任意・写真3枠・形状切替・質感メタ・確認ダイアログ）
- **出品管理** `/sell/manage`・`/sell/edit/[id]` — 一覧・ステータス変更・編集・削除
- **お気に入り** `/favorites`、**ログイン** `/login`

## 技術スタック

| 項目 | 採用 |
|---|---|
| フレームワーク | Astro 5 SSR（`output: 'server'`）+ React islands |
| ホスティング | Cloudflare Pages/Workers（`@astrojs/cloudflare`） |
| スタイル | Tailwind CSS 4（`@tailwindcss/vite`、`@theme` トークン） |
| 3Dビューア | three.js + `@mkkellogg/gaussian-splats-3d`（GLB/GLTF・PLY/SPLAT/KSPLAT） |
| マップ | MapLibre GL + OpenFreeMap（APIキー不要） |
| BaaS | Supabase（Auth / Postgres / Storage=写真） |
| 3Dモデル置き場 | Cloudflare R2（S3互換 API・`aws4fetch`） |
| メール通知 | Resend（未設定時は console スタブ） |

## データモード（最重要）

環境変数 `DATA_MODE`（既定 `mock`）で全データアクセスを切り替えます。`src/lib/server/data/index.ts` が唯一の入口です。

- **`mock`**: `src/data/seed.ts` から初期化したインメモリストア。ミューテーションは dev サーバー生存中のみ保持。アップロードファイルは `public/uploads/`（gitignore対象）に `node:fs` で保存。**ローカル開発専用**。
- **`supabase`**: 本実装。`supabase/migrations/0001_init.sql` のスキーマに対して `@supabase/supabase-js` / `@supabase/ssr` で動作。写真は Supabase Storage、3Dモデルは R2。

> ✅ **`supabase` モードは実プロジェクトで検証済み**（2026-06-13）。Supabase（ref `bhndghuowkmlihnddhje`・東京リージョン）にスキーマ適用・シード投入を行い、一覧／詳細／ログイン（メール+パスワード）／お気に入り／出品（書き込み）まで動作確認済み。3Dモデルは Cloudflare R2（`zaimoku-models`・APAC）に保存し、r2.dev 公開URL + CORS（`*` 許可）で配信。`mock` モードはローカル開発用に引き続き利用可能。
>
> 🔑 検証用のシード出品者（メール/パスワードログイン）: `morimoku@example.com` / `inarinsan@example.com` / `tenryu@example.com`、いずれもパスワード `Seed-pass-2026!`。**本番運用前に失効・変更すること。**

## ローカル起動（mock モード）

```bash
yarn install
cp .env.example .env   # DATA_MODE=mock のまま
yarn seed:images    # 樹種ごとの木目調プレースホルダ画像を public/seed/ に生成（初回のみ）
yarn dev            # http://localhost:4321
```

### mock のデモログイン

`/login` で2つのデモユーザーを切り替えられます。

- **買い手としてログイン**（`buyer-demo`）: 検索・お気に入り・購入リクエスト
- **盛木材としてログイン**（`seller-morimoku`、出品者）: 出品・出品管理

### 検証コマンド

```bash
yarn check   # astro check（型）
yarn build   # 本番ビルド
```

## 環境変数一覧

| 変数 | 用途 | mock | supabase |
|---|---|:--:|:--:|
| `DATA_MODE` | `mock` \| `supabase` | ✓ | ✓ |
| `SUPABASE_URL` | Supabase プロジェクト URL | – | ✓ |
| `SUPABASE_ANON_KEY` | 公開 anon キー（認証クライアント用） | – | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー（サーバー側 DB/Storage 書き込み） | – | ✓ |
| `R2_ACCOUNT_ID` | Cloudflare アカウント ID | – | ✓ |
| `R2_ACCESS_KEY_ID` | R2 API トークンのアクセスキー | – | ✓ |
| `R2_SECRET_ACCESS_KEY` | R2 API トークンのシークレット | – | ✓ |
| `R2_BUCKET` | モデル用バケット名（例 `zaimoku-models`） | – | ✓ |
| `R2_PUBLIC_BASE_URL` | R2 の公開URLベース（パブリックバケット or カスタムドメイン） | – | ✓ |
| `RESEND_API_KEY` | メール通知（未設定時は console スタブ） | 任意 | 任意 |

`.env.example` をコピーして埋めてください。`SUPABASE_SERVICE_ROLE_KEY` と R2 シークレットは秘匿情報です（コミット禁止・本番は Pages/Workers のシークレットに登録）。

## Supabase セットアップ手順

1. [supabase.com](https://supabase.com) でプロジェクトを作成。
2. **マイグレーション適用**: ダッシュボードの SQL Editor で `supabase/migrations/0001_init.sql` を実行（または Supabase CLI で `supabase db push`）。
   - 作成されるもの: `profiles` / `listings` / `listing_photos` / `favorites` / `purchase_requests`、各 RLS ポリシー、`auth.users` → `profiles` 自動作成トリガ（role デフォルト `buyer`）、Storage `photos` バケット＋ポリシー。
3. **Google OAuth 設定**: Authentication → Providers → Google を有効化。
   - Google Cloud Console で OAuth クライアントを作成し、リダイレクトURIに `https://<project-ref>.supabase.co/auth/v1/callback` を追加。
   - クライアントID / シークレットを Supabase に登録。
   - アプリ側のコールバックは `/api/auth/callback`（`signInWithOAuth` の `redirectTo` に指定済み）。
4. **出品者ロールの付与**: seller は**管理者が手動付与**します（申請UIなし）。SQL Editor で:
   ```sql
   update public.profiles
   set role = 'seller',
       company_name = '盛木材',
       short_label = '盛木',
       avatar_color = '#2f4a2e',
       location_label = '長野県伊那市',
       lat = 35.827, lng = 137.9536
   where id = '<auth-user-uuid>';
   ```
5. **env 設定**: `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` を `.env`（と本番シークレット）に設定し、`DATA_MODE=supabase` に変更。

## Cloudflare R2 セットアップ（3Dモデル）

1. R2 を有効化（ダッシュボードで Purchase R2 Plan。無料枠あり）→ バケット作成（例 `zaimoku-models`）。
2. **公開アクセス**: バケットの r2.dev 開発URLを有効化（`pub-xxxx.r2.dev`）するか、カスタムドメインを割り当て、その URL を `R2_PUBLIC_BASE_URL` に設定。本プロジェクトでは r2.dev を使用。
3. **API トークン**: R2 → Manage API Tokens で **Account API token**（Object Read & Write・対象バケット限定）を発行し、Access Key ID / Secret を `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` に設定。`R2_ACCOUNT_ID` はアカウント ID。
4. **CORS 設定（必須）**: 3Dビューア（three.js）がブラウザから GLB を `fetch` するため、バケットに CORS 許可が必要。ダッシュボードの Bucket → Settings → CORS Policy、または Cloudflare API で以下を設定:
   ```
   PUT /accounts/{account_id}/r2/buckets/zaimoku-models/cors
   {"rules":[{"allowed":{"origins":["*"],"methods":["GET","HEAD"],"headers":["*"]},"maxAgeSeconds":3600}]}
   ```
   （3Dモデルは公開資産のため `*` 許可で問題なし。本番ドメインに絞ることも可）
5. **シードのモデル投入**: `seed-data/models/*.glb` を `public/models/` に置き、`yarn seed:posters`（GLB→ポスターPNG生成）→ `aws4fetch` で R2 に PUT → `yarn seed:supabase`（`R2_PUBLIC_BASE_URL` があれば model/poster URL を R2 URL で投入）。
6. 出品時のアップロードは `/api/upload` 経由の**サーバープロキシ**（クライアント→サーバー→`aws4fetch` で R2 へ PUT）。

> ⚠️ **Cloudflare Workers のリクエストボディ上限は 100MB** です。50MB を超える大きな3Dモデルはこの上限に注意してください（出品フォームは 50MB 超で警告を表示）。より大きいファイルを扱う場合は、クライアントから R2 へ直接 PUT する presigned URL 方式（`/api/upload-url` を別途用意）への切り替えを検討してください。
>
> 💰 **支出アラート**: R2 は従量課金（固定費なし・無料枠あり）。Cloudflare ダッシュボード → Manage Account → Billing → Notifications で「Billing usage alert」をしきい値（例 $1）で設定しておくと、無料枠を超え始めた段階でメール通知が届きます。

## Resend セットアップ（メール通知）

1. [resend.com](https://resend.com) で API キーを発行し、`RESEND_API_KEY` に設定。
2. 送信ドメインを検証（未検証の間は `onboarding@resend.dev` から送信、本番はカスタムドメイン推奨）。
3. 未設定時は購入リクエスト通知が `console.log` スタブ出力になります（`src/lib/server/email.ts`）。

## Cloudflare デプロイ

```bash
yarn build
# Pages（ダッシュボード接続 or CLI）
npx wrangler pages deploy dist
```

- `wrangler.toml` に最小構成（`nodejs_compat`、`pages_build_output_dir`、KV/R2/vars のコメント例）。
- `@astrojs/cloudflare` の Sessions 機能が `SESSION` KV バインディングを要求します。KV namespace を作成し `wrangler.toml` で有効化してください（`wrangler kv namespace create SESSION`）。
- 本番の環境変数・シークレットは Pages/Workers のダッシュボード or `wrangler pages secret put <NAME>` で設定。
- `astro.config.mjs` の `platformProxy.enabled = true` により、dev でも `Astro.locals.runtime.env` 経由でバインディング/変数にアクセスできます。

## ディレクトリ構成（抜粋）

```
src/
  components/
    sell/UploadForm.tsx     出品フォーム（新規/編集 兼用）
    sell/ManageList.tsx     出品管理（ステータス変更・削除）
    auth/AuthForm.tsx       supabase ログインUI（Google + メール/パスワード）
  lib/
    listingInput.ts         出品入力の検証・正規化（フォーム⇄API 共有）
    server/
      data/{index,mock,supabase,types}.ts   データ層（mock/supabase ディスパッチ）
      session.ts            セッション解決（mock cookie / supabase ssr）
      supabaseServer.ts     @supabase/ssr の cookie アダプタ
      storage.ts            アップロード保存（mock fs / Supabase Storage / R2）
  pages/
    sell.astro, sell/manage.astro, sell/edit/[id].astro
    api/upload.ts, api/listings.ts, api/auth/{callback,signout}.ts
supabase/migrations/0001_init.sql
```

## Supabase 実装で要確認の箇所（実プロジェクト接続時）

未検証のため、接続後に以下を点検してください。

- **service_role の利用範囲**: サーバーは service_role キーで RLS をバイパスして読み書きしています。所有チェック・ロール判定はアプリ層（`/api/listings`・`getSession`）で担保。意図通りか確認。
- **RLS ポリシー**: `listings_insert_owner` は `profiles.role = 'seller'` を要求します。クライアント直アクセス（将来）時の挙動を確認。
- **profiles トリガ**: `handle_new_user` が `raw_user_meta_data->>'name'` を表示名に使用。Google OAuth のメタデータ形に合わせて調整が必要な場合あり。
- **Storage 公開URL**: `photos` バケットは public 前提。`getPublicUrl` の返す URL 形式と CORS を確認。
- **R2 公開URL**: `R2_PUBLIC_BASE_URL` がパブリックバケット/カスタムドメインを指すこと。署名なしで読めるか確認。
- **cookie アダプタ**: `AstroCookies` に `getAll` が無いため、`src/lib/server/supabaseServer.ts` でリクエストの `Cookie` ヘッダを自前パースしています。@supabase/ssr のバージョン更新時に互換性を確認。
- **seller プロフィール**: 現状 `sellerProfile.sellerId = user.id`（profiles と listings.seller_id を auth ユーザーIDで直結）。屋号等の出品者表示情報は `profiles` の seller 列に依存。
