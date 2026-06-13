// ユーザーアバターの表示ヘルパー。
// ソーシャルログイン（Google等）の画像が無いユーザー向けに、
// 名前から決定的に「イニシャル + 背景色」を生成する。

// 視認性の高い落ち着いた背景色のパレット（文字は白で読める明度）。
const AVATAR_COLORS = [
  '#2f4a2e', // 深緑
  '#6b4a2e', // こげ茶
  '#7a3b2e', // 赤茶
  '#2e4a6b', // 紺
  '#5a3b7a', // 紫
  '#2e6b5a', // 青緑
  '#8a4f00', // 琥珀
  '#6b2e4a', // 臙脂
  '#3b5a2e', // 苔
  '#2e5a6b', // 鴨青
];

/** 文字列から決定的にハッシュ値（非負整数）を得る。 */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0; // 32bit
  }
  return Math.abs(h);
}

/** 名前/IDから決定的に背景色を選ぶ（同じユーザーは常に同じ色）。 */
export function avatarColor(seed: string): string {
  return AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length]!;
}

/**
 * 表示名からイニシャルを作る。
 * 日本語名は先頭1文字、英数字名は先頭2文字（語頭）を大文字で。
 */
export function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // ASCII 英数主体なら語頭を拾って最大2文字
  if (/^[\x00-\x7F]+$/.test(trimmed)) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0]![0]! + words[1]![0]!).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  // 日本語などは先頭1文字（会社名等はそのままだと長いため）
  return [...trimmed][0]!;
}
