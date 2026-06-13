// Supabase へシードデータ（出品者3社・11品目）を投入するスクリプト。
//   yarn seed:supabase
// 必要 env（.env から読む）: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// 出品者は auth ユーザー（email/パスワード）として作成し、profiles に seller として upsert。
// 冪等: 既存の同一 email ユーザーは再利用し、その出品を一旦全削除してから入れ直す。
//
// 注意: seed.ts は TS なので、ここでは値をこのファイル内に複製せず、tsx 無しで動くよう
// JSON 相当のデータをインラインで持つ（seed.ts と一致させること）。

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// --- .env 読み込み（依存を増やさない簡易パーサ） ---
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env が無ければ環境変数をそのまま使う */
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env を確認）。');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// ===== 出品者（seed.ts の seedSellers と一致させる） =====
const SELLERS = [
  {
    key: 'seller-morimoku',
    email: 'morimoku@example.com',
    companyName: '盛木材',
    shortLabel: '盛木',
    avatarColor: '#2f4a2e',
    locationLabel: '長野県伊那市',
    lat: 35.827,
    lng: 137.9536,
    bio: '伊那市の製材所。地域材を一本ずつ大切に挽いています。',
  },
  {
    key: 'seller-inarinsan',
    email: 'inarinsan@example.com',
    companyName: '伊那林産',
    shortLabel: '伊林',
    avatarColor: '#6b4a2e',
    locationLabel: '長野県駒ヶ根市',
    lat: 35.7286,
    lng: 137.9339,
    bio: '駒ヶ根市の森林組合。曲がり材・端材も価値ある資源として扱います。',
  },
  {
    key: 'seller-tenryu',
    email: 'tenryu@example.com',
    companyName: '天竜木材',
    shortLabel: '天竜',
    avatarColor: '#7a3b2e',
    locationLabel: '長野県飯田市',
    lat: 35.5147,
    lng: 137.8217,
    bio: '飯田市の材木屋。銘木から日常使いの材まで幅広く。',
  },
];

const SELLER_PASSWORD = 'Seed-pass-2026!';

// R2 に実写（main の JPG）をアップロード済みの製材済み品目。
// 3D品目（hoonoki / magari-nara）は写真の main を 3Dポスター画像にする。
// 追加写真（-2.jpg / -3.jpg）は upload-listing-photos.mjs で全品目にアップ済み。
const REAL_PHOTO_SLUGS = new Set([
  'kaba', 'karamatsu', 'akamatsu', 'sugi', 'hinoki', 'kuri', 'udaikanba',
]);

const PLACEHOLDER = '/placeholder.png';

// 各出品の写真行を組み立てる。
// 1枚目(main): 実写品目は seed-photos/<slug>-main.jpg、3D品目はポスター(<modelSlug>.png)。
// 2枚目以降: seed-photos/<slug>-2.jpg, -3.jpg（upload-listing-photos.mjs でアップ済み）。
// R2 未設定なら placeholder.png にフォールバック。
const photos = (l) => {
  const base = R2_BASE.replace(/\/$/, '');
  const slug = l.slug;

  let mainUrl;
  if (R2_BASE && l.modelSlug) {
    mainUrl = `${base}/${l.modelSlug}.png`; // 3Dポスター
  } else if (R2_BASE && REAL_PHOTO_SLUGS.has(slug)) {
    mainUrl = `${base}/seed-photos/${slug}-main.jpg`;
  } else {
    mainUrl = PLACEHOLDER;
  }

  const rows = [{ url: mainUrl, is_main: true, sort: 0 }];
  // 追加の板材写真（樹種の色味に合わせてアップ済み）
  for (let i = 2; i <= 3; i++) {
    rows.push({
      url: R2_BASE ? `${base}/seed-photos/${slug}-${i}.jpg` : PLACEHOLDER,
      is_main: false,
      sort: i - 1,
    });
  }
  return rows;
};

// ===== 11品目（src/data/seed.ts の seedListings と値を一致させること。slug は画像ファイル名用） =====
const LISTINGS = [
  { slug: 'kaba', sellerKey: 'seller-morimoku', title: '樺の木', species: 'カバ', shape: 'sawn', lengthMm: 2000, widthMm: 180, thicknessMm: 20, stock: 13, price: 80000, priceUnit: 'per_m3', minUnitLabel: '1本からOK', description: '緻密で硬く、上品な光沢のある樺材です。家具や床材におすすめ。よく乾燥しています。', moisture: '12%', dryness: '人工乾燥（KD）', heartwood: '赤身主体', knots: '小節少なめ', postedAt: '2026-05-13T09:00:00+09:00' },
  { slug: 'karamatsu', sellerKey: 'seller-morimoku', title: 'カラマツ', species: 'カラマツ', shape: 'sawn', lengthMm: 2000, widthMm: 180, thicknessMm: 20, stock: 13, price: 20000, priceUnit: 'per_m3', minUnitLabel: '1本からOK', description: '赤褐色の力強い木目が魅力。デッキ材や構造材に。', moisture: '15%', dryness: '天然乾燥（AD）', postedAt: '2026-05-23T09:00:00+09:00' },
  { slug: 'akamatsu', sellerKey: 'seller-inarinsan', title: '赤松', species: 'アカマツ', shape: 'sawn', lengthMm: 3000, widthMm: 150, thicknessMm: 24, stock: 8, price: 20000, priceUnit: 'per_m3', minUnitLabel: '1本からOK', description: '粘りがあり梁・桁に向く赤松。脂の乗った艶やかな表情。', postedAt: '2026-04-13T09:00:00+09:00' },
  { slug: 'hoonoki', sellerKey: 'seller-morimoku', title: '四つ又ホオノキ', species: 'ホオノキ', shape: 'irregular', stock: 1, price: 2000, priceUnit: 'per_item', minUnitLabel: '1本からOK', description: '四方に枝分かれした珍しい又木。彫刻やオブジェ素材に。3Dスキャンで形そのものを確認できます。', heartwood: '緑灰がかった白太', modelSlug: 'scan-small', modelFormat: 'glb', posterUrl: '/models/scan-small.png', postedAt: '2026-05-30T09:00:00+09:00' },
  { slug: 'sugi', sellerKey: 'seller-tenryu', title: 'スギ', species: 'スギ', shape: 'sawn', lengthMm: 3000, widthMm: 120, thicknessMm: 30, stock: 20, price: 15000, priceUnit: 'per_m3', minUnitLabel: '1本からOK', description: '軽くて加工しやすい天竜杉。内装・建具に幅広く。', moisture: '18%', dryness: '天然乾燥（AD）', heartwood: '赤身白太境目あり', postedAt: '2026-06-06T09:00:00+09:00' },
  { slug: 'hinoki', sellerKey: 'seller-tenryu', title: 'ヒノキ', species: 'ヒノキ', shape: 'sawn', lengthMm: 3000, widthMm: 105, thicknessMm: 30, stock: 6, price: 35000, priceUnit: 'per_m3', minUnitLabel: '1本からOK', description: '淡黄白の美しい肌目と芳香。柱・造作の定番。', moisture: '14%', dryness: '人工乾燥（KD）', postedAt: '2026-06-10T09:00:00+09:00' },
  { slug: 'kuri', sellerKey: 'seller-inarinsan', title: 'クリ', species: 'クリ', shape: 'sawn', lengthMm: 1800, widthMm: 200, thicknessMm: 40, stock: 4, price: 60000, priceUnit: 'per_m3', minUnitLabel: '1本からOK', description: '耐久性に優れた黄褐色のクリ材。土台・家具・テーブル天板に。', heartwood: '赤身主体', knots: '化粧節あり', postedAt: '2026-05-29T09:00:00+09:00' },
  { slug: 'magari-nara', sellerKey: 'seller-inarinsan', title: '曲がりナラ', species: 'ナラ', shape: 'irregular', stock: 1, price: 8000, priceUnit: 'per_item', minUnitLabel: '1本からOK', description: '大きく湾曲したナラの一点物。アーチや脚物の素材に。3Dスキャンで曲線を確認できます。', heartwood: '灰褐の重厚な赤身', modelSlug: 'scan-large', modelFormat: 'glb', posterUrl: '/models/scan-large.png', postedAt: '2026-05-16T09:00:00+09:00' },
  { slug: 'udaikanba', sellerKey: 'seller-tenryu', title: 'ウダイカンバ 赤身一枚板', species: 'カンバ', shape: 'sawn', lengthMm: 2200, widthMm: 450, thicknessMm: 50, stock: 2, price: 180000, priceUnit: 'per_m3', minUnitLabel: '1枚からOK', description: '赤白2トーンが美しい銘木の一枚板。一枚物のテーブル天板に最適。', moisture: '11%', dryness: '人工乾燥（KD）', heartwood: '赤身・白太のコントラスト', postedAt: '2026-06-01T09:00:00+09:00' },
];

const R2_BASE = process.env.R2_PUBLIC_BASE_URL || '';

async function findUserByEmail(email) {
  // listUsers をページングして探す（プロジェクトの規模なら1ページで足りる）
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureSeller(s) {
  let user = await findUserByEmail(s.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: s.email,
      password: SELLER_PASSWORD,
      email_confirm: true,
      user_metadata: { name: s.companyName },
    });
    if (error) throw error;
    user = data.user;
    console.log(`  created auth user: ${s.email}`);
  } else {
    console.log(`  reuse auth user: ${s.email}`);
  }

  const { error: upErr } = await admin.from('profiles').upsert(
    {
      id: user.id,
      role: 'seller',
      display_name: s.companyName,
      company_name: s.companyName,
      short_label: s.shortLabel,
      avatar_color: s.avatarColor,
      location_label: s.locationLabel,
      lat: s.lat,
      lng: s.lng,
      bio: s.bio,
      contact_email: s.email,
    },
    { onConflict: 'id' },
  );
  if (upErr) throw upErr;
  return user.id;
}

async function main() {
  console.log('▶ 出品者を作成 / 更新...');
  const sellerId = {};
  for (const s of SELLERS) {
    sellerId[s.key] = await ensureSeller(s);
  }

  console.log('▶ 既存のシード出品を削除（出品者の出品を全削除）...');
  for (const key of Object.keys(sellerId)) {
    const { error } = await admin.from('listings').delete().eq('seller_id', sellerId[key]);
    if (error) throw error;
  }

  console.log('▶ 出品を投入...');
  for (const l of LISTINGS) {
    const base = R2_BASE.replace(/\/$/, '');
    const modelUrl = l.modelSlug
      ? R2_BASE
        ? `${base}/${l.modelSlug}.glb`
        : `/models/${l.modelSlug}.glb`
      : null;
    // ポスターも R2 が設定されていれば R2 公開URL（${modelSlug}.png）に揃える
    const posterUrl = l.posterUrl
      ? R2_BASE && l.modelSlug
        ? `${base}/${l.modelSlug}.png`
        : l.posterUrl
      : null;

    const { data: inserted, error } = await admin
      .from('listings')
      .insert({
        seller_id: sellerId[l.sellerKey],
        title: l.title,
        species: l.species,
        shape: l.shape,
        length_mm: l.lengthMm ?? null,
        width_mm: l.widthMm ?? null,
        thickness_mm: l.thicknessMm ?? null,
        stock: l.stock,
        price: l.price,
        price_unit: l.priceUnit,
        min_unit_label: l.minUnitLabel,
        status: 'published',
        description: l.description ?? null,
        moisture: l.moisture ?? null,
        dryness: l.dryness ?? null,
        heartwood: l.heartwood ?? null,
        knots: l.knots ?? null,
        model_url: modelUrl,
        model_format: l.modelFormat ?? null,
        model_poster_url: posterUrl,
        posted_at: l.postedAt,
      })
      .select('id')
      .single();
    if (error) throw error;

    const listingId = inserted.id;
    const rows = photos(l).map((p) => ({ ...p, listing_id: listingId }));
    const { error: pErr } = await admin.from('listing_photos').insert(rows);
    if (pErr) throw pErr;
    console.log(`  ✓ ${l.title} (${listingId})`);
  }

  console.log('\n✅ 完了。出品者ログイン（メール/パスワード）:');
  for (const s of SELLERS) console.log(`   ${s.email} / ${SELLER_PASSWORD}  (${s.companyName})`);
  console.log('\n※ これらは検証用のダミー出品者です。本番では失効・パスワード変更してください。');
}

main().catch((e) => {
  console.error('\n❌ シード投入に失敗:', e.message || e);
  process.exit(1);
});
