import type { Listing, Seller } from '@/lib/types';

// ===== 出品者3社（伊那谷に分散） =====

export const seedSellers: Seller[] = [
  {
    id: 'seller-morimoku',
    companyName: '盛木材',
    shortLabel: '盛木',
    avatarColor: '#2f4a2e',
    locationLabel: '長野県伊那市',
    lat: 35.827,
    lng: 137.9536,
    bio: '伊那市の製材所。地域材を一本ずつ大切に挽いています。',
  },
  {
    id: 'seller-inarinsan',
    companyName: '伊那林産',
    shortLabel: '伊林',
    avatarColor: '#6b4a2e',
    locationLabel: '長野県駒ヶ根市',
    lat: 35.7286,
    lng: 137.9339,
    bio: '駒ヶ根市の森林組合。曲がり材・端材も価値ある資源として扱います。',
  },
  {
    id: 'seller-tenryu',
    companyName: '天竜木材',
    shortLabel: '天竜',
    avatarColor: '#7a3b2e',
    locationLabel: '長野県飯田市',
    lat: 35.5147,
    lng: 137.8217,
    bio: '飯田市の材木屋。銘木から日常使いの材まで幅広く。',
  },
];

// ===== 写真ヘルパー =====
// 実写真は R2 公開バケットにアップロード済み（scripts/upload-listing-photos.mjs）。
// 公開URLは秘匿情報ではないため直接参照する。R2 に無い品目は placeholder.png。
//
// 注意: ここは mock データモード専用（クライアントにバンドルされるため env を読めない）。
// このベースURL・実写品目集合・ファイル名規約（<id>-main/-2/-3.jpg）は
// scripts/seed-supabase.mjs（env R2_PUBLIC_BASE_URL 駆動）と
// scripts/upload-listing-photos.mjs（PUTキー）と同じバケットを指す。変更時は3箇所を揃えること。

const R2_PHOTO_BASE =
  'https://pub-0f7782ca86a54f1e8377c89f1a15ff21.r2.dev/seed-photos';

// main 実写真がある品目（3D品目は main をポスター画像にするため除外）。
const REAL_PHOTO_IDS = new Set([
  'kaba',
  'karamatsu',
  'akamatsu',
  'sugi',
  'hinoki',
  'kuri',
  'udaikanba',
]);

/**
 * 出品の写真配列を返す。
 * 1枚目(main): 実写品目は <id>-main.jpg、3D品目は modelPosterUrl 側に委ねるため placeholder。
 * 2枚目以降: <id>-2.jpg / <id>-3.jpg（樹種の色味に合わせた板材写真）。
 */
function photos(id: string): Listing['photos'] {
  const main = REAL_PHOTO_IDS.has(id)
    ? `${R2_PHOTO_BASE}/${id}-main.jpg`
    : '/placeholder.png';
  return [
    { url: main, isMain: true },
    { url: `${R2_PHOTO_BASE}/${id}-2.jpg`, isMain: false },
    { url: `${R2_PHOTO_BASE}/${id}-3.jpg`, isMain: false },
  ];
}

// ===== 9品目 =====
// 樹種スラッグ（id）は R2 写真ファイル名（seed-photos/<id>-*.jpg）にも使用する。

export const seedListings: Listing[] = [
  {
    id: 'kaba',
    sellerId: 'seller-morimoku',
    title: '樺の木',
    species: 'カバ',
    shape: 'sawn',
    lengthMm: 2000,
    widthMm: 180,
    thicknessMm: 20,
    stock: 13,
    price: 80000,
    priceUnit: 'per_m3',
    minUnitLabel: '1本からOK',
    status: 'published',
    description:
      '緻密で硬く、上品な光沢のある樺材です。家具や床材におすすめ。よく乾燥しています。',
    moisture: '12%',
    dryness: '人工乾燥（KD）',
    heartwood: '赤身主体',
    knots: '小節少なめ',
    photos: photos('kaba'),
    postedAt: '2026-05-13T09:00:00+09:00', // 約1か月前
  },
  {
    id: 'karamatsu',
    sellerId: 'seller-morimoku',
    title: 'カラマツ',
    species: 'カラマツ',
    shape: 'sawn',
    lengthMm: 2000,
    widthMm: 180,
    thicknessMm: 20,
    stock: 13,
    price: 20000,
    priceUnit: 'per_m3',
    minUnitLabel: '1本からOK',
    status: 'published',
    description: '赤褐色の力強い木目が魅力。デッキ材や構造材に。',
    moisture: '15%',
    dryness: '天然乾燥（AD）',
    photos: photos('karamatsu'),
    postedAt: '2026-05-23T09:00:00+09:00', // 約3週間前
  },
  {
    id: 'akamatsu',
    sellerId: 'seller-inarinsan',
    title: '赤松',
    species: 'アカマツ',
    shape: 'sawn',
    lengthMm: 3000,
    widthMm: 150,
    thicknessMm: 24,
    stock: 8,
    price: 20000,
    priceUnit: 'per_m3',
    minUnitLabel: '1本からOK',
    status: 'published',
    description: '粘りがあり梁・桁に向く赤松。脂の乗った艶やかな表情。',
    photos: photos('akamatsu'),
    postedAt: '2026-04-13T09:00:00+09:00', // 約2か月前
  },
  {
    id: 'hoonoki',
    sellerId: 'seller-morimoku',
    title: '四つ又ホオノキ',
    species: 'ホオノキ',
    shape: 'irregular',
    stock: 1,
    price: 2000,
    priceUnit: 'per_item',
    minUnitLabel: '1本からOK',
    status: 'published',
    description:
      '四方に枝分かれした珍しい又木。彫刻やオブジェ素材に。3Dスキャンで形そのものを確認できます。',
    heartwood: '緑灰がかった白太',
    modelUrl: '/models/scan-small.glb',
    modelFormat: 'glb',
    modelPosterUrl: '/models/scan-small.png',
    photos: photos('hoonoki'),
    postedAt: '2026-05-30T09:00:00+09:00', // 約2週間前
  },
  {
    id: 'sugi',
    sellerId: 'seller-tenryu',
    title: 'スギ',
    species: 'スギ',
    shape: 'sawn',
    lengthMm: 3000,
    widthMm: 120,
    thicknessMm: 30,
    stock: 20,
    price: 15000,
    priceUnit: 'per_m3',
    minUnitLabel: '1本からOK',
    status: 'published',
    description: '軽くて加工しやすい天竜杉。内装・建具に幅広く。',
    moisture: '18%',
    dryness: '天然乾燥（AD）',
    heartwood: '赤身白太境目あり',
    photos: photos('sugi'),
    postedAt: '2026-06-06T09:00:00+09:00', // 約1週間前
  },
  {
    id: 'hinoki',
    sellerId: 'seller-tenryu',
    title: 'ヒノキ',
    species: 'ヒノキ',
    shape: 'sawn',
    lengthMm: 3000,
    widthMm: 105,
    thicknessMm: 30,
    stock: 6,
    price: 35000,
    priceUnit: 'per_m3',
    minUnitLabel: '1本からOK',
    status: 'published',
    description: '淡黄白の美しい肌目と芳香。柱・造作の定番。',
    moisture: '14%',
    dryness: '人工乾燥（KD）',
    photos: photos('hinoki'),
    postedAt: '2026-06-10T09:00:00+09:00', // 数日前
  },
  {
    id: 'kuri',
    sellerId: 'seller-inarinsan',
    title: 'クリ',
    species: 'クリ',
    shape: 'sawn',
    lengthMm: 1800,
    widthMm: 200,
    thicknessMm: 40,
    stock: 4,
    price: 60000,
    priceUnit: 'per_m3',
    minUnitLabel: '1本からOK',
    status: 'published',
    description: '耐久性に優れた黄褐色のクリ材。土台・家具・テーブル天板に。',
    heartwood: '赤身主体',
    knots: '化粧節あり',
    photos: photos('kuri'),
    postedAt: '2026-05-29T09:00:00+09:00', // 約2週間前
  },
  {
    id: 'magari-nara',
    sellerId: 'seller-inarinsan',
    title: '曲がりナラ',
    species: 'ナラ',
    shape: 'irregular',
    stock: 1,
    price: 8000,
    priceUnit: 'per_item',
    minUnitLabel: '1本からOK',
    status: 'published',
    description:
      '大きく湾曲したナラの一点物。アーチや脚物の素材に。3Dスキャンで曲線を確認できます。',
    heartwood: '灰褐の重厚な赤身',
    modelUrl: '/models/scan-large.glb',
    modelFormat: 'glb',
    modelPosterUrl: '/models/scan-large.png',
    photos: photos('magari-nara'),
    postedAt: '2026-05-16T09:00:00+09:00', // 約4週間前
  },
  {
    id: 'udaikanba',
    sellerId: 'seller-tenryu',
    title: 'ウダイカンバ 赤身一枚板',
    species: 'カンバ',
    shape: 'sawn',
    lengthMm: 2200,
    widthMm: 450,
    thicknessMm: 50,
    stock: 2,
    price: 180000,
    priceUnit: 'per_m3',
    minUnitLabel: '1枚からOK',
    status: 'published',
    description: '赤白2トーンが美しい銘木の一枚板。一枚物のテーブル天板に最適。',
    moisture: '11%',
    dryness: '人工乾燥（KD）',
    heartwood: '赤身・白太のコントラスト',
    photos: photos('udaikanba'),
    postedAt: '2026-06-01T09:00:00+09:00', // 約2週間前
  },
];
