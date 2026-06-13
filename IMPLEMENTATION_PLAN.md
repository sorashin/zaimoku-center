# 実装計画 — 伊那材木センター

SPEC.md（確定仕様）を実装に落とす計画。フェーズ1→2→3の順に実装し、各フェーズ末で `npm run build` が通ることを必須とする。

## 全体アーキテクチャ

```
astro@5 (SSR, output:'server') + @astrojs/react + @astrojs/cloudflare
tailwindcss@4 (@tailwindcss/vite, @theme でデザイントークン定義)
three + @mkkellogg/gaussian-splats-3d  … 3Dビューア island
maplibre-gl                            … マップ island（OpenFreeMap liberty スタイル）
@supabase/supabase-js + @supabase/ssr  … supabaseモード時のみ実働
aws4fetch                              … R2 presigned URL（supabaseモード時のみ）
```

### データモード（最重要の横断方針）
環境変数 `DATA_MODE=mock|supabase`（デフォルト mock）。
- `src/lib/server/data/index.ts` が唯一の入口。`mock.ts` / `supabase.ts` を内部でディスパッチ。
- **mock**: `src/data/seed.ts` から初期化したモジュールスコープのインメモリストア。ミューテーション（出品・お気に入り・リクエスト）はdevサーバー生存中のみ保持。アップロードファイルは `public/uploads/`（gitignore対象）に node:fs で保存（mockはローカルdev専用なのでfs可）。
- **supabase**: 本実装。schema は `supabase/migrations/0001_init.sql`。アカウント未作成のため動作確認はmockで行い、supabase実装はコードレビュー品質で書き切る。
- 認証も同様に抽象化: `src/lib/server/session.ts` の `getSession(Astro)` → `{ user: { id, name, role, sellerProfile? } | null }`。
  - mock: cookie `demo_user`（`buyer-demo` / `seller-morimoku`）。`/login` にデモログインボタン2つ。
  - supabase: @supabase/ssr のcookieフロー。Google OAuth + email/password フォーム（コードは書くが未検証でよい）。

### ドメイン型（src/lib/types.ts）
```ts
type Shape = 'sawn' | 'irregular';
type ListingStatus = 'published' | 'closed' | 'sold';
interface Seller { id; companyName; shortLabel /* 丸アイコン用2文字 */; avatarColor; locationLabel; lat; lng; }
interface Listing {
  id; sellerId; title; species; shape: Shape;
  lengthMm?; widthMm?; thicknessMm?;   // sawnのみ
  stock; price; priceUnit: 'per_m3' | 'per_item';
  minUnitLabel;                         // 「1本からOK」等
  status: ListingStatus;
  description?; moisture?; dryness?; heartwood?; knots?;  // 質感メタ（任意）
  modelUrl?; modelFormat?: 'glb' | 'splat';
  photos: { url; isMain }[];
  postedAt: string;                     // ISO。表示は相対表記に変換
}
```
材積: `vol = len*wid*thk / 1e9`（㎥/本）。概算総額: `round(price * vol) * qty`（per_m3時）。

### デザイントークン（src/styles/global.css の @theme）
- 背景canvas: `#FAF7F2`（生成り）/ カードsurface: `#FFFFFF` / インク: `#222222` / 本文サブ: `#6a6a6a` / 淡色: `#929292`
- ヘアライン: `#E8E1D5`（生成りに馴染む暖色グレー）, 強ボーダー `#C9C0B2`
- **プライマリー: `#FF9F1C`**, active: `#F18B00`, 淡色tint: `#FFE9CC`
- エラー: `#C13515`
- 角丸: 8px(ボタン・入力) / 14px(カード・ビューア) / 9999px(ピル・チップ)
- フォント: 'Noto Sans JP'（Google Fonts, weight 400/500/600/700）
- 余白・タイポスケールはAirbnb design.md準拠（8px基調、見出し18〜21px/600、本文14〜16px、控えめなウェイト）
- **CTAボタンは #FF9F1C 地 × #222 文字（weight 700）**。白文字はコントラスト不足のため使わない。
- 影は1段のみ: `rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.08) 0 4px 8px`
- カード登場はシンプルなフェードイン（0.4s, 順次delay）

### 画面・ルーティング
| パス | 内容 | レンダリング |
|---|---|---|
| `/` | 一覧。デスクトップ(≥1024px): 左カードグリッド2〜3列+右マップ(sticky, 1/3幅)。モバイル: カード1列+「マップ」フローティングピルで全画面マップ⇔リスト切替 | SSR + `ListBrowser` island (client:load) |
| `/items/[id]` | 詳細。3Dビューア主役（モデル無し時は写真ギャラリー）、3D⇔フォト切替トグル+サムネ列、タイトル/バッジ/価格、スペック表、説明文、出品者カード、所在地MiniMap（ぼかし円）、関連在庫（同出品者・小型カード横スクロール）、sticky下部バー→購入リクエストシート | SSR + islands |
| `/sell` | 出品フォーム（seller限定、buyerは案内表示へ） | `UploadForm` island |
| `/sell/manage` | 自分の出品一覧・ステータス変更（公開/売切れ/停止）・編集リンク・削除 | SSR + island |
| `/sell/edit/[id]` | 出品編集（UploadForm再利用） | island |
| `/favorites` | お気に入り一覧（要ログイン） | SSR |
| `/login` | mock: デモログイン2ボタン / supabase: Google+メールPW | island |
| API | `/api/favorites`(POST toggle), `/api/requests`(POST), `/api/listings`(POST/PATCH/DELETE), `/api/upload`(mock: multipart受けてfs保存), `/api/upload-url`(supabase: R2 presign), `/api/auth/*` | Astro endpoints |

### 3Dビューア（src/components/viewer/）
- `ModelViewer.tsx`（wrapper）: 拡張子/formatで `GlbViewer` / `SplatViewer` を出し分け。共通UI: ローディング進捗、「ドラッグで回転・ピンチで拡大」初回ヒント（操作で消える）、全画面ボタン、右下「3D」バッジ。
- GLB: three.js + GLTFLoader(+DRACOLoader CDN decoder) + OrbitControls(damping) + RoomEnvironment照明 + 自動回転（autoRotate、pointerdownで停止）。モデルはbounding boxでセンタリング・カメラフィット。
- splat: `@mkkellogg/gaussian-splats-3d` Viewer（.ply/.splat/.ksplat）。同じくOrbitControls相当+自動回転。
- `client:visible` で遅延ロード。three系はdynamic importでチャンク分離。

### マップ（src/components/map/）
- `ListingsMap.tsx`: maplibre-gl。スタイル `https://tiles.openfreemap.org/styles/liberty`。中心は伊那谷 [137.95, 35.72] zoom≈9。出品をHTMLマーカー（白ピル: 丸アイコン+「樹種｜¥80,000/㎥」）で表示、クリックで詳細へ。カードhover⇔ピンhighlight連動はデスクトップのみ・余裕があれば。
- `MiniMap.tsx`: 詳細用。インタラクション最小、出品者拠点に半透明円（半径~800m）+中心ドット。「正確な引き渡し場所は取引確定後に共有されます。」注記。

### シードデータ（src/data/seed.ts）
出品者3社（伊那谷に分散）:
- 盛木材（MoriMoku）/ 盛木 / 伊那市 35.8270,137.9536
- 伊那林産 / 伊林 / 駒ヶ根市 35.7286,137.9339
- 天竜木材 / 天竜 / 飯田市 35.5147,137.8217

11品目（SPEC.mdの通り。製材済み7・不定形材4扱い）。樺¥80,000/㎥・カラマツ¥20,000/㎥・赤松¥20,000/㎥・四つ又ホオノキ¥2,000一点・スギ¥15,000/㎥・ヒノキ¥35,000/㎥・クリ¥60,000/㎥・曲がりナラ¥8,000一点・ウダイカンバ一枚板¥180,000/㎥・又木サクラ¥3,500一点・ケヤキ端材セット¥5,000一点(不定形材扱い)。
- 3Dモデル: `public/models/scan-small.glb`(3MB)→四つ又ホオノキ、`public/models/scan-large.glb`(15MB)→曲がりナラ。（seed-data/models/ からコピー）
- 写真: `scripts/generate-seed-images.mjs` で樹種ごとの木目調SVGプレースホルダ（木肌色グラデ+年輪/木目ライン+樹種名）を `public/seed/` に生成（各品目: メイン+木口+木目の3枚）。

## フェーズ分割

### フェーズ1: 基盤+一覧
scaffold（package.json, astro.config.mjs, tsconfig, tailwind, .gitignore, .env.example）、global.css トークン、types、seed.ts、seed画像生成スクリプト、mockデータ層+session、Baseレイアウト（ヘッダー: ロゴ+「出品する」+ログイン/ユーザー）、`/` 一覧（カード・フィルター・ソート・検索・マップ・レスポンシブ分割ビュー）、`/login`（mockデモログイン）。
完了条件: `npm run build` 成功、`npm run dev` で一覧とマップが表示・フィルタ動作。

### フェーズ2: 詳細+3Dビューア+お気に入り
`/items/[id]` 一式（MediaViewer・スペック・出品者・MiniMap・関連在庫・RequestSheet）、ModelViewer(GLB+splat)、`/api/requests`+email stub、ハート（楽観的UI、未ログイン→/login誘導）、`/favorites`。
完了条件: build成功。実GLB2点がビューアで回転・ズーム・自動回転すること。

### フェーズ3: 出品+管理+Supabase実装
`/sell`（UploadForm: モデル任意+写真3枠+基本情報+形状切替+質感メタ折りたたみ+確認ダイアログ）、`/sell/manage`+編集・削除・ステータス、`/api/upload`(mock fs)、supabase.ts データ層実装、`supabase/migrations/0001_init.sql`（テーブル+RLS）、R2 presign、AuthForm(supabaseモードUI)、wrangler.toml、README（セットアップ手順: Supabase/Cloudflare/R2/Resend/デプロイ）。
完了条件: build成功。mockモードで出品→一覧反映→管理画面操作の一連が動く。

### フェーズ4: QA（メインループで実施）
dev起動、chrome-devtoolsでスクリーンショット検証（モバイル/デスクトップ）、コンソールエラー確認、修正。

## 実装規約
- TypeScript strict。コンポーネントは関数コンポーネント+型付きprops。
- UIテキストはすべて日本語。価格は `toLocaleString('ja-JP')`。日付相対表記ユーティリティ `timeAgo()`（「3日前」「2週間前」「1か月前」）。
- islandは必要最小限。静的にできる部分はAstroコンポーネントで。
- プロトタイプ `design/prototype/伊那材木センター.dc.html` のレイアウト・コンポーネント寸法を忠実に再現しつつ、色だけSPECのトークンに置換。
- 触ったフェーズの完了時に `npx astro check`（型）と `npm run build` を必ず通す。
