// 3Dモデルの向き補正（プリセット）。スキャンアプリの書き出し向きが上下逆さま・
// 横倒しになることがあるため、出品時に正位置へ補正できるようにする。
//
// プリセットの実体は「XYZ各軸まわりの回転角（度）」。GlbViewer（three.js）と
// SplatViewer（gaussian-splats-3d）の双方が、この度数 → ラジアンで回転を適用する。
// enum を1つ保存するだけにして、DB/フォーム/各ビューア間のやり取りを単純化する。

export type ModelOrientation =
  | 'default'
  | 'flip'
  | 'rotateLeft'
  | 'rotateRight'
  | 'rotate180';

export const MODEL_ORIENTATION_DEFAULT: ModelOrientation = 'default';

/** プリセット → 各軸の回転角（度）。three.js の Euler 'XYZ' 順で適用する。 */
const ROTATION_DEG: Record<ModelOrientation, [number, number, number]> = {
  default: [0, 0, 0],
  flip: [180, 0, 0], // 上下反転（前後方向の軸まわりに半回転）
  rotateLeft: [0, 90, 0], // 水平に左90°
  rotateRight: [0, -90, 0], // 水平に右90°
  rotate180: [0, 180, 0], // 水平に180°（裏返し）
};

/** 選択肢のラベル（フォーム UI 用）。順序が表示順。 */
export const MODEL_ORIENTATION_OPTIONS: { value: ModelOrientation; label: string }[] = [
  { value: 'default', label: '正位置' },
  { value: 'flip', label: '上下反転' },
  { value: 'rotateLeft', label: '左90°' },
  { value: 'rotateRight', label: '右90°' },
  { value: 'rotate180', label: '180°' },
];

const DEG = Math.PI / 180;

/** プリセット → ラジアン [x, y, z]。ビューアが three の rotation に直接代入できる。 */
export function orientationToRadians(
  orientation?: ModelOrientation | null
): [number, number, number] {
  const deg = ROTATION_DEG[orientation ?? MODEL_ORIENTATION_DEFAULT] ?? ROTATION_DEG.default;
  return [deg[0] * DEG, deg[1] * DEG, deg[2] * DEG];
}

/** 不正値・未指定を default に丸める。永続化・受信時の正規化に使う。 */
export function normalizeOrientation(v: unknown): ModelOrientation {
  return v === 'flip' || v === 'rotateLeft' || v === 'rotateRight' || v === 'rotate180'
    ? v
    : 'default';
}
