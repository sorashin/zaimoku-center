import { useEffect, useRef, useState } from 'react';

/**
 * 2つまみのレンジスライダー。
 * - 値は mm の絶対値（min/max）。両端まで動かすと「指定なし」（onChange に null を返す）。
 * - 左つまみが domainMin、右つまみが domainMax にあるとき、その側は「指定なし」。
 */
interface Props {
  /** スライダーの取りうる範囲 */
  domainMin: number;
  domainMax: number;
  /** 現在値（null は端＝指定なし） */
  valueMin: number | null;
  valueMax: number | null;
  /** つまみ移動の刻み（mm） */
  step?: number;
  onChange: (min: number | null, max: number | null) => void;
}

const PRIMARY = 'var(--color-primary)';

export function RangeSlider({
  domainMin,
  domainMax,
  valueMin,
  valueMax,
  step = 1,
  onChange,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'min' | 'max' | null>(null);
  // ドラッグ開始時に測ったトラック矩形をキャッシュ（move ごとの getBoundingClientRect を避ける）。
  const rectRef = useRef<{ left: number; width: number } | null>(null);

  const span = Math.max(1, domainMax - domainMin);
  // 実効値（null は端に丸める）。
  const lo = valueMin ?? domainMin;
  const hi = valueMax ?? domainMax;
  const pct = (v: number) => ((v - domainMin) / span) * 100;

  const clampStep = (v: number) => {
    const snapped = Math.round(v / step) * step;
    return Math.min(domainMax, Math.max(domainMin, snapped));
  };

  // 端に達したら null（指定なし）に丸める。
  const emit = (nextLo: number, nextHi: number) => {
    onChange(nextLo <= domainMin ? null : nextLo, nextHi >= domainMax ? null : nextHi);
  };

  // clientX → 値。ドラッグ中はキャッシュ矩形、単発クリック時は実測。
  const posToValue = (clientX: number) => {
    const cached = rectRef.current;
    const box = cached ?? trackRef.current?.getBoundingClientRect();
    if (!box) return domainMin;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return clampStep(domainMin + ratio * span);
  };

  // move/emit/最新値は ref 経由で参照し、effect 依存を [drag] のみにする
  // （pointermove ごとのリスナ貼り替えと useCallback 再生成を防ぐ）。
  const moveRef = useRef<(e: PointerEvent) => void>(() => {});
  moveRef.current = (e: PointerEvent) => {
    const v = posToValue(e.clientX);
    if (drag === 'min') emit(Math.min(v, hi), hi);
    else if (drag === 'max') emit(lo, Math.max(v, lo));
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => moveRef.current(e);
    const up = () => {
      rectRef.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag]);

  // 単一値の場合（domainMin===domainMax）は操作不能なので無効表示。
  const disabled = domainMax <= domainMin;

  // ドラッグ開始時にトラック矩形を1回だけ測ってキャッシュする。
  const cacheRect = () => {
    const el = trackRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      rectRef.current = { left: r.left, width: r.width };
    }
  };

  const onTrackDown = (e: React.PointerEvent) => {
    if (disabled) return;
    cacheRect();
    const v = posToValue(e.clientX);
    // 近い方のつまみを掴む
    const nearMin = Math.abs(v - lo) <= Math.abs(v - hi);
    if (nearMin) {
      setDrag('min');
      emit(Math.min(v, hi), hi);
    } else {
      setDrag('max');
      emit(lo, Math.max(v, lo));
    }
  };

  const knobKey = (which: 'min' | 'max') => (e: React.KeyboardEvent) => {
    if (disabled) return;
    let dLo = lo;
    let dHi = hi;
    const delta = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    if (which === 'min') dLo = Math.min(hi, Math.max(domainMin, lo + delta));
    else dHi = Math.max(lo, Math.min(domainMax, hi + delta));
    emit(dLo, dHi);
  };

  return (
    <div className="flex-1 select-none py-2" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div
        ref={trackRef}
        onPointerDown={onTrackDown}
        className="relative h-6 cursor-pointer"
      >
        {/* レール */}
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-pill bg-surface-muted" />
        {/* 選択区間 */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-pill"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%`, background: PRIMARY }}
        />
        {/* 左つまみ */}
        <button
          type="button"
          role="slider"
          aria-label="最小値"
          aria-valuemin={domainMin}
          aria-valuemax={domainMax}
          aria-valuenow={lo}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (disabled) return;
            cacheRect();
            setDrag('min');
          }}
          onKeyDown={knobKey('min')}
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary shadow-[rgba(0,0,0,0.2)_0_1px_4px_0] outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          style={{ left: `${pct(lo)}%`, touchAction: 'none' }}
        />
        {/* 右つまみ */}
        <button
          type="button"
          role="slider"
          aria-label="最大値"
          aria-valuemin={domainMin}
          aria-valuemax={domainMax}
          aria-valuenow={hi}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (disabled) return;
            cacheRect();
            setDrag('max');
          }}
          onKeyDown={knobKey('max')}
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary shadow-[rgba(0,0,0,0.2)_0_1px_4px_0] outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          style={{ left: `${pct(hi)}%`, touchAction: 'none' }}
        />
      </div>
    </div>
  );
}
