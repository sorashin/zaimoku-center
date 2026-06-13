import { useEffect, useRef } from 'react';
import type { ListingCardView } from '@/lib/listingView';

interface Props {
  items: ListingCardView[];
  /** カードhover連動で強調するピンのid（任意） */
  highlightedId?: string | null;
  className?: string;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const IINA_CENTER: [number, number] = [137.95, 35.72];
const IINA_ZOOM = 9;

/** 出品の所在地を価格ピル付きマーカーで表示する maplibre 地図。 */
export function ListingsMap({ items, highlightedId, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // id -> マーカーのDOM要素（hover強調用）
  const markerEls = useRef<Map<string, HTMLElement>>(new Map());
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | null = null;

    async function init() {
      const maplibregl = (await import('maplibre-gl')).default;
      // CSS を動的に読み込み
      await import('maplibre-gl/dist/maplibre-gl.css');
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: IINA_CENTER,
        zoom: IINA_ZOOM,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // 同一拠点に複数出品があるため、ピクセル単位で縦に積んで重なりを避ける
      // （座標をずらすと地理が嘘になるため、Markerのoffsetで分離する）
      const seenAt = new Map<string, number>();

      for (const item of items) {
        const key = `${item.seller.lat},${item.seller.lng}`;
        const seen = seenAt.get(key) ?? 0;
        seenAt.set(key, seen + 1);

        // maplibre は外側要素の transform(translate) で位置を管理するため、
        // hover強調の scale は内側の inner 要素に当てて位置transformと衝突させない
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', `${item.title} を見る`);
        el.style.cssText = 'background:none;border:none;padding:0;cursor:pointer;font-family:inherit';

        const inner = document.createElement('span');
        inner.style.cssText = [
          'display:flex',
          'align-items:center',
          'gap:6px',
          'background:#ffffff',
          'border-radius:9999px',
          'padding:4px 11px 4px 4px',
          'box-shadow:rgba(0,0,0,0.18) 0 2px 8px 0',
          'white-space:nowrap',
          'transition:transform .15s ease, box-shadow .15s ease',
        ].join(';');

        const dot = document.createElement('span');
        dot.style.cssText = `width:22px;height:22px;border-radius:9999px;background:${item.seller.avatarColor};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0`;
        dot.textContent = item.seller.shortLabel;

        const label = document.createElement('span');
        label.style.cssText = 'font-size:12px;font-weight:600;color:#222222';
        label.textContent = item.pinLabel;

        inner.appendChild(dot);
        inner.appendChild(label);
        el.appendChild(inner);
        el.addEventListener('click', () => {
          window.location.href = `/items/${item.id}`;
        });

        markerEls.current.set(item.id, inner);

        new maplibregl.Marker({ element: el, offset: [0, seen * 36] })
          .setLngLat([item.seller.lng, item.seller.lat])
          .addTo(map);
      }
    }

    init();

    return () => {
      cancelled = true;
      markerEls.current.clear();
      if (map) map.remove();
      mapRef.current = null;
    };
    // items は SSR で確定し再生成されない想定。マウント時のみ初期化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hover連動: 強調ピンを拡大（inner要素にscaleを当て、位置transformを壊さない）
  useEffect(() => {
    markerEls.current.forEach((inner, id) => {
      // maplibreが管理する外側マーカー要素（位置transform担当）
      const markerEl = inner.parentElement;
      if (id === highlightedId) {
        inner.style.transform = 'scale(1.12)';
        inner.style.boxShadow = 'rgba(255,159,28,0.6) 0 0 0 2px, rgba(0,0,0,0.2) 0 4px 12px 0';
        if (markerEl) markerEl.style.zIndex = '5';
      } else {
        inner.style.transform = 'scale(1)';
        inner.style.boxShadow = 'rgba(0,0,0,0.18) 0 2px 8px 0';
        if (markerEl) markerEl.style.zIndex = '';
      }
    });
  }, [highlightedId]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
