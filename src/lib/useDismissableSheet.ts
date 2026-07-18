import { useCallback, useState } from 'react';

/**
 * 退場アニメ付きボトムシートの状態機械。
 * 開いている間は入場アニメ（sheetUp / overlayFadeIn）、閉じる要求で退場アニメ
 * （sheetDown / overlayFadeOut）を再生し、そのアニメ完了時に onClosed を呼ぶ。
 *
 * RequestSheet / FilterDialog / UploadForm の3シートで共有する
 * （同一の「closing フラグ + animationend で unmount」ロジックの重複を排除）。
 *
 * 使い方:
 *   const sheet = useDismissableSheet(() => setOpen(false));
 *   <div style={sheet.overlayStyle} onClick={() => sheet.requestClose()} />
 *   <div style={sheet.sheetStyle} onAnimationEnd={sheet.onAnimationEnd}>…</div>
 *
 * 閉じる理由で分岐したい場合は requestClose に後処理を渡す:
 *   sheet.requestClose(() => onApply(draft));
 */
export interface DismissableSheet {
  /** 退場アニメ中か。 */
  closing: boolean;
  /**
   * 退場アニメを開始する。多重呼び出しは無視。
   * onClosed をこの場で差し替えたい場合（適用して閉じる等）は after を渡す。
   */
  requestClose: (after?: () => void) => void;
  /** シート要素の style（入場/退場アニメ）。 */
  sheetStyle: { animation: string };
  /** オーバーレイ要素の style（入場/退場フェード）。 */
  overlayStyle: { animation: string };
  /** シート要素の onAnimationEnd に渡す。退場アニメ完了で onClosed を実行。 */
  onAnimationEnd: (e: React.AnimationEvent) => void;
  /** 開き直すときにフックの内部状態をリセットする（closing/after を解除）。 */
  reset: () => void;
}

/**
 * @param onClosed 退場アニメ完了時に呼ぶ既定の後処理（通常は open=false にする）。
 * @param canClose 閉じてよいかのガード（例: 送信中は閉じない）。false の間 requestClose は無視。
 */
export function useDismissableSheet(
  onClosed: () => void,
  canClose = true
): DismissableSheet {
  const [closing, setClosing] = useState(false);
  // 退場アニメ完了時に onClosed の代わりに実行する後処理（requestClose の引数）。
  const [after, setAfter] = useState<(() => void) | null>(null);

  const requestClose = useCallback(
    (fn?: () => void) => {
      if (!canClose) return;
      setClosing((c) => {
        if (c) return c; // 多重呼び出しは無視
        if (fn) setAfter(() => fn);
        return true;
      });
    },
    [canClose]
  );

  const reset = useCallback(() => {
    setClosing(false);
    setAfter(null);
  }, []);

  const onAnimationEnd = useCallback(
    (e: React.AnimationEvent) => {
      // 子要素のアニメ完了で誤発火しないよう、シート要素自身の完了だけを拾う。
      if (!closing || e.target !== e.currentTarget) return;
      if (after) after();
      else onClosed();
    },
    [closing, after, onClosed]
  );

  return {
    closing,
    requestClose,
    reset,
    onAnimationEnd,
    sheetStyle: {
      animation: closing ? 'sheetDown 0.25s ease forwards' : 'sheetUp 0.3s ease',
    },
    overlayStyle: {
      animation: closing ? 'overlayFadeOut 0.25s ease forwards' : 'overlayFadeIn 0.2s ease',
    },
  };
}
