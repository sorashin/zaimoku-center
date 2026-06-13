#!/usr/bin/env node
// 樹種ごとの木目調SVGプレースホルダを public/seed/ に生成する。
// 各品目について main / koguchi（木口） / mokume（木目アップ）の3枚を出力。
// 木肌色は樹種ごとに変える（IMPLEMENTATION_PLAN.md の指定に準拠）。

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'seed');

// id は seed.ts の Listing.id に一致させる。
// 木肌色: { base, dark, light, ring } を樹種ごとに調整。
const ITEMS = [
  { id: 'kaba', label: 'カバ（樺）', base: '#d8b878', dark: '#b8924a', light: '#ecd9a8', ring: '#a87f3c' }, // 明るい黄褐
  { id: 'karamatsu', label: 'カラマツ', base: '#c06a3a', dark: '#9a4d24', light: '#dd9468', ring: '#7e3c1a' }, // 赤褐
  { id: 'akamatsu', label: 'アカマツ', base: '#d08846', dark: '#a8632a', light: '#eab074', ring: '#8a4f20' }, // 橙褐
  { id: 'hoonoki', label: 'ホオノキ', base: '#9aa088', dark: '#737a62', light: '#bcc0a8', ring: '#5e6450' }, // 緑灰
  { id: 'sugi', label: 'スギ', base: '#b5603a', dark: '#8c4226', light: '#d68a60', ring: '#6f3320' }, // 赤茶
  { id: 'hinoki', label: 'ヒノキ', base: '#ecdcb4', dark: '#cdb888', light: '#f7eed4', ring: '#b89e6c' }, // 淡黄白
  { id: 'kuri', label: 'クリ', base: '#c79a52', dark: '#9c7236', light: '#e0bd80', ring: '#7e5b28' }, // 黄褐
  { id: 'magari-nara', label: 'ナラ（曲がり）', base: '#9c8460', dark: '#73603e', light: '#c0a982', ring: '#5c4c30' }, // 灰褐
  { id: 'udaikanba', label: 'ウダイカンバ', base: '#d9a880', dark: '#b07a52', light: '#f0d8c0', ring: '#8a583a', twoTone: '#e8d8c8' }, // 赤白2トーン
];

const W = 800;
const H = 800;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 縦の木目ライン（板目の流れ）を数本描く */
function grainLines(c) {
  let p = '';
  const count = 7;
  for (let i = 0; i < count; i++) {
    const x = ((i + 0.5) / count) * W;
    const wobble = 26 + (i % 3) * 10;
    const sw = 1.6 + (i % 2) * 1.2;
    const op = 0.22 + (i % 3) * 0.06;
    const cx1 = x + wobble;
    const cx2 = x - wobble;
    p += `<path d="M ${x.toFixed(0)} 0 C ${cx1.toFixed(0)} ${(H * 0.33).toFixed(0)}, ${cx2.toFixed(0)} ${(H * 0.66).toFixed(0)}, ${x.toFixed(0)} ${H}" fill="none" stroke="${c.dark}" stroke-width="${sw}" stroke-opacity="${op}" stroke-linecap="round"/>`;
  }
  return p;
}

/** 年輪円（木口）を数本描く */
function annualRings(c, cx, cy) {
  let p = '';
  for (let r = 36; r < 420; r += 30 + (r / 14)) {
    const op = 0.3 + Math.min(0.35, r / 1400);
    const sw = 2 + (r % 60 < 30 ? 1.4 : 0);
    p += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(0)}" fill="none" stroke="${c.ring}" stroke-width="${sw.toFixed(1)}" stroke-opacity="${op.toFixed(2)}"/>`;
  }
  // 中心の髄
  p += `<circle cx="${cx}" cy="${cy}" r="6" fill="${c.ring}" fill-opacity="0.8"/>`;
  return p;
}

function header(_label, _kindLabel) {
  // ラベル帯はカード上で黒帯に見えてしまうため描画しない（純粋な木肌テクスチャにする）
  return '';
}

function gradientDefs(c) {
  const top = c.twoTone ?? c.light;
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="0.5" stop-color="${c.base}"/>
      <stop offset="1" stop-color="${c.dark}"/>
    </linearGradient>
    <radialGradient id="koguchi" cx="46%" cy="46%" r="70%">
      <stop offset="0" stop-color="${c.light}"/>
      <stop offset="1" stop-color="${c.dark}"/>
    </radialGradient>
  </defs>`;
}

function mainSvg(c) {
  const twoToneBand = c.twoTone
    ? `<rect x="0" y="0" width="${W * 0.4}" height="${H}" fill="${c.twoTone}" fill-opacity="0.55"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${gradientDefs(c)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${twoToneBand}
  ${grainLines(c)}
  ${header(c.label, 'メイン')}
</svg>`;
}

function koguchiSvg(c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${gradientDefs(c)}
  <rect width="${W}" height="${H}" fill="${c.base}"/>
  <rect width="${W}" height="${H}" fill="url(#koguchi)" fill-opacity="0.5"/>
  ${annualRings(c, W * 0.46, H * 0.46)}
  ${header(c.label, '木口（年輪）')}
</svg>`;
}

function mokumeSvg(c) {
  // 木目アップ: より密で水平寄りの流れ
  let lines = '';
  const count = 16;
  for (let i = 0; i < count; i++) {
    const y = ((i + 0.5) / count) * H;
    const wob = 18 + (i % 4) * 8;
    const op = 0.18 + (i % 3) * 0.05;
    lines += `<path d="M 0 ${y.toFixed(0)} C ${(W * 0.33).toFixed(0)} ${(y - wob).toFixed(0)}, ${(W * 0.66).toFixed(0)} ${(y + wob).toFixed(0)}, ${W} ${y.toFixed(0)}" fill="none" stroke="${c.dark}" stroke-width="2.2" stroke-opacity="${op}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${gradientDefs(c)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${lines}
  ${header(c.label, '木目アップ')}
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let n = 0;
  for (const c of ITEMS) {
    await writeFile(join(OUT_DIR, `${c.id}-main.svg`), mainSvg(c), 'utf8');
    await writeFile(join(OUT_DIR, `${c.id}-koguchi.svg`), koguchiSvg(c), 'utf8');
    await writeFile(join(OUT_DIR, `${c.id}-mokume.svg`), mokumeSvg(c), 'utf8');
    n += 3;
  }
  console.log(`生成完了: ${ITEMS.length} 品目 × 3枚 = ${n} ファイル -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
