// 画像表示の共通ヘルパー。読み込み失敗時に placeholder へ差し替える。

/** 画像が無い/読み込み失敗時に表示するプレースホルダ。 */
export const PLACEHOLDER_IMAGE = '/placeholder.png';

/**
 * <img onError> 用のハンドラ。読み込み失敗時に placeholder へ差し替える。
 * placeholder 自体の失敗では再代入しない（無限ループ防止）。
 */
export function onImgError(e: { currentTarget: HTMLImageElement }) {
  const img = e.currentTarget;
  if (img.src.endsWith(PLACEHOLDER_IMAGE)) return;
  img.src = PLACEHOLDER_IMAGE;
}

/** Astro テンプレートの inline onerror 属性用（React ハンドラを使えない箇所向け）。 */
export const ONERROR_FALLBACK = `if(!this.src.endsWith('${PLACEHOLDER_IMAGE}')){this.src='${PLACEHOLDER_IMAGE}';}`;
