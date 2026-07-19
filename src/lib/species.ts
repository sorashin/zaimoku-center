// 樹種の広葉樹/針葉樹分類マスタ。
// データモデルには species（樹種名の文字列）しか無いため、名前 → 分類をここで一元管理する。
// 出品フォームの樹種選択肢（listingInput.ts の SPECIES_OPTIONS）もこのマスタから導出し、
// 「アプリが提供する樹種はすべて分類済み」であることを構造的に担保する（二重管理を避ける）。
// 未知の樹種（「その他」自由入力など）は 'unknown' 扱いとし、分類フィルタでは「すべて」でのみヒットする。

export type WoodClass = 'conifer' | 'broadleaf' | 'unknown';

/**
 * 樹種名 → 分類のマスタ。ここが樹種の唯一の源泉。
 * 先頭に出品フォームの選択肢を並べ、以降は判定用の別名・追加樹種。
 */
const SPECIES_TABLE: Record<string, Exclude<WoodClass, 'unknown'>> = {
  // --- 出品フォームの選択肢（SPECIES_OPTIONS の元。順序はそのまま選択肢に使う） ---
  カラマツ: 'conifer',
  アカマツ: 'conifer',
  スギ: 'conifer',
  ヒノキ: 'conifer',
  カバ: 'broadleaf',
  ホオノキ: 'broadleaf',
  クリ: 'broadleaf',
  ナラ: 'broadleaf',
  サクラ: 'broadleaf',
  ケヤキ: 'broadleaf',
  // --- 判定用の別名・その他の樹種（選択肢には出さないが分類はできる） ---
  クロマツ: 'conifer',
  マツ: 'conifer',
  ツガ: 'conifer',
  モミ: 'conifer',
  サワラ: 'conifer',
  ヒバ: 'conifer',
  アスナロ: 'conifer',
  カンバ: 'broadleaf',
  シラカバ: 'broadleaf',
  ホオ: 'broadleaf',
  クルミ: 'broadleaf',
  カキ: 'broadleaf',
  柿: 'broadleaf',
  ハンノキ: 'broadleaf',
  クヌギ: 'broadleaf',
  ブナ: 'broadleaf',
  トチ: 'broadleaf',
  キリ: 'broadleaf',
  クス: 'broadleaf',
  タモ: 'broadleaf',
  セン: 'broadleaf',
};

/** 出品フォームの樹種選択肢（マスタの先頭10種）。「その他」は呼び出し側で付与する。 */
export const CLASSIFIED_SPECIES = [
  'カラマツ',
  'アカマツ',
  'スギ',
  'ヒノキ',
  'カバ',
  'ホオノキ',
  'クリ',
  'ナラ',
  'サクラ',
  'ケヤキ',
] as const;

/** 樹種名から広葉樹/針葉樹を判定する。前後の空白は無視する。 */
export function classifySpecies(species: string): WoodClass {
  return SPECIES_TABLE[species.trim()] ?? 'unknown';
}

/** 分類フィルタの選択肢。'all' は絞り込みなし（未分類も含めすべて表示）。 */
export type WoodClassFilter = 'all' | 'conifer' | 'broadleaf';

export const WOOD_CLASS_LABELS: Record<WoodClassFilter, string> = {
  all: 'すべて',
  broadleaf: '広葉樹',
  conifer: '針葉樹',
};
