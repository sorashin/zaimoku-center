import { useEffect, useRef } from 'react';

interface Props {
  lat: number;
  lng: number;
  className?: string;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * 詳細ページの所在地ミニマップ。出品者拠点を中心に、半透明の円（半径~800m）＋中心ドット。
 * 操作は最小（scrollZoom 無効）。正確な引き渡し場所はぼかして示す。
 */
export function MiniMap({ lat, lng, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | null = null;

    async function init() {
      const maplibregl = (await import('maplibre-gl')).default;
      await import('maplibre-gl/dist/maplibre-gl.css');
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [lng, lat],
        zoom: 12.5,
        attributionControl: { compact: true },
        interactive: true,
      });

      // 操作は最小: スクロールズーム・回転を無効化
      map.scrollZoom.disable();
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();

      map.on('load', () => {
        if (!map) return;

        // 半径 ~800m の半透明円（GeoJSON + circle layer、ズーム連動の半径計算）
        map.addSource('approx', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} },
        });

        // メートル→ピクセル換算でズーム連動の円を描く
        const metersToPixelsAtZoom = (meters: number, latitude: number, zoom: number) =>
          meters / (78271.484 / 2 ** zoom / Math.cos((latitude * Math.PI) / 180));

        map.addLayer({
          id: 'approx-circle',
          type: 'circle',
          source: 'approx',
          paint: {
            'circle-color': 'rgba(255,159,28,0.16)',
            'circle-stroke-color': 'rgba(241,139,0,0.55)',
            'circle-stroke-width': 2,
            'circle-radius': [
              'interpolate',
              ['exponential', 2],
              ['zoom'],
              0,
              0,
              22,
              metersToPixelsAtZoom(800, lat, 22),
            ],
          },
        });

        // 中心ドット
        const el = document.createElement('div');
        el.style.cssText =
          'width:14px;height:14px;border-radius:9999px;background:#F18B00;border:3px solid #ffffff;box-shadow:rgba(0,0,0,0.2) 0 1px 4px 0';
        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
    // 拠点は SSR で確定。マウント時のみ初期化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
