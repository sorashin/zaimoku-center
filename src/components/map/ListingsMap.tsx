import { useEffect, useRef } from 'react';
import type { ListingCardView } from '@/lib/listingView';

interface Props {
  items: ListingCardView[];
  /** カードhover連動で強調するピンのid（任意） */
  highlightedId?: string | null;
  /** 選択中のピンid（カルーセル連動）。selected があると強調し flyTo する */
  selectedId?: string | null;
  /**
   * ピンタップ時のハンドラ（任意）。
   * 指定時は遷移せず onSelect を呼ぶ（モバイルのカルーセル連動用）。
   * 未指定時は従来どおり詳細ページへ遷移する。
   */
  onSelect?: (id: string) => void;
  className?: string;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const IINA_CENTER: [number, number] = [137.95, 35.72];
const IINA_ZOOM = 9;
/** このズーム以上で個別の価格ピルを表示。未満は件数のみのクラスタ丸を表示。 */
const PILL_ZOOM = 12;
/** クラスタ化のグリッド一辺（画面ピクセル）。この距離内のピンは1つにまとめる。 */
const CLUSTER_GRID_PX = 64;

/** maplibre は動的 import のため型は import type で参照する。 */
type MlMap = import('maplibre-gl').Map;
type MlMarker = import('maplibre-gl').Marker;
/** 描画関数で使う maplibre のコンストラクタ群（動的 import した default の部分型）。 */
interface Maplibre {
  Marker: new (
    options?: import('maplibre-gl').MarkerOptions
  ) => MlMarker;
}

/** 出品の所在地を、ズームに応じてクラスタ丸／価格ピルで表示する maplibre 地図。 */
export function ListingsMap({ items, highlightedId, selectedId, onSelect, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // id -> 価格ピルの inner 要素（hover強調用。ピル表示中のみ有効）
  const markerEls = useRef<Map<string, HTMLElement>>(new Map());
  const mapRef = useRef<MlMap | null>(null);
  const maplibreRef = useRef<Maplibre | null>(null);
  // id -> 座標（selected連動の flyTo 用）
  const coords = useRef<Map<string, [number, number]>>(new Map());
  // クリックハンドラから最新の onSelect を参照するための ref
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // 現在表示中のマーカー（再描画時に破棄する）
  const markers = useRef<MlMarker[]>([]);
  // 直近に描画したモード（'pill'|'cluster'）。同一モード内のズーム微動では再描画しない。
  const renderedMode = useRef<'pill' | 'cluster' | null>(null);

  // items は SSR で確定し再生成されない想定だが、最新参照を描画関数から使えるよう ref に保持。
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;

    async function init() {
      const maplibregl = (await import('maplibre-gl')).default;
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
      maplibreRef.current = maplibregl;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      const render = () => renderMarkers();
      // 初回描画は load 後（project が使える）。以降はズーム帯（pill/cluster）の変化や
      // クラスタ表示中の再グルーピングのため moveend で描画し直す
      // （同一 pill モードでズーム帯を越えていなければ renderMarkers 内で早期 return）。
      map.on('load', render);
      map.on('moveend', render);
    }

    init();

    return () => {
      cancelled = true;
      clearMarkers();
      markerEls.current.clear();
      if (map) map.remove();
      mapRef.current = null;
    };
    // マウント時のみ初期化。items 変更時の再描画は moveend/明示 render で拾う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearMarkers() {
    for (const m of markers.current) m.remove();
    markers.current = [];
    markerEls.current.clear();
  }

  /** 現在のズームに応じて、価格ピル or 件数クラスタでマーカー群を描画する。 */
  function renderMarkers() {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl) return;

    const mode: 'pill' | 'cluster' = map.getZoom() >= PILL_ZOOM ? 'pill' : 'cluster';

    // クラスタは移動のたびに位置が変わり得るので毎回描画。ピルはモードが変わった時だけ描画。
    if (mode === 'pill' && renderedMode.current === 'pill') return;

    clearMarkers();
    renderedMode.current = mode;

    // coords は selected 連動の flyTo に常に必要なので、ここで最新化。
    coords.current.clear();
    for (const item of itemsRef.current) {
      coords.current.set(item.id, [item.seller.lng, item.seller.lat]);
    }

    if (mode === 'pill') {
      renderPills(map, maplibregl);
    } else {
      renderClusters(map, maplibregl);
    }

    // 描画直後に hover/selected 強調を反映（ピル表示時のみ意味を持つ）。
    applyActive();
  }

  /** 個別の価格ピルを描画（従来表示）。同一拠点はピクセルオフセットで縦積み。 */
  function renderPills(map: MlMap, maplibregl: Maplibre) {
    const seenAt = new Map<string, number>();
    for (const item of itemsRef.current) {
      const key = `${item.seller.lat},${item.seller.lng}`;
      const seen = seenAt.get(key) ?? 0;
      seenAt.set(key, seen + 1);

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
        if (onSelectRef.current) onSelectRef.current(item.id);
        else window.location.href = `/items/${item.id}`;
      });

      markerEls.current.set(item.id, inner);

      const marker = new maplibregl.Marker({ element: el, offset: [0, seen * 36] })
        .setLngLat([item.seller.lng, item.seller.lat])
        .addTo(map);
      markers.current.push(marker);
    }
  }

  /**
   * 件数クラスタを描画。画面ピクセル上のグリッド（CLUSTER_GRID_PX）で近接ピンをまとめ、
   * グループの重心に「件数の丸」を1つ置く。クリックでその範囲にズームインする。
   */
  function renderClusters(map: MlMap, maplibregl: Maplibre) {
    // グリッドセル -> そのセルに属する出品
    const cells = new Map<string, { items: ListingCardView[]; sumX: number; sumY: number }>();

    for (const item of itemsRef.current) {
      const p = map.project([item.seller.lng, item.seller.lat]);
      const gx = Math.floor(p.x / CLUSTER_GRID_PX);
      const gy = Math.floor(p.y / CLUSTER_GRID_PX);
      const key = `${gx}:${gy}`;
      const cell = cells.get(key);
      if (cell) {
        cell.items.push(item);
        cell.sumX += item.seller.lng;
        cell.sumY += item.seller.lat;
      } else {
        cells.set(key, { items: [item], sumX: item.seller.lng, sumY: item.seller.lat });
      }
    }

    for (const cell of cells.values()) {
      const count = cell.items.length;
      const centerLng = cell.sumX / count;
      const centerLat = cell.sumY / count;

      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `この付近の在庫 ${count} 件を拡大`);
      el.style.cssText = 'background:none;border:none;padding:0;cursor:pointer;font-family:inherit';

      // 件数に応じて丸を少しだけ大きく（1件でも丸で統一）。
      const size = count >= 10 ? 44 : count >= 5 ? 40 : 34;
      const circle = document.createElement('span');
      circle.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `width:${size}px`,
        `height:${size}px`,
        'border-radius:9999px',
        'background:#FF9F1C',
        'color:#ffffff',
        'font-size:14px',
        'font-weight:700',
        'box-shadow:rgba(0,0,0,0.2) 0 2px 8px 0',
        'transition:transform .15s ease',
      ].join(';');
      circle.textContent = String(count);
      el.appendChild(circle);

      el.addEventListener('click', () => {
        // クラスタをタップしたらその重心へズームイン。ピル表示閾値を必ず超えるようにする。
        map.flyTo({
          center: [centerLng, centerLat],
          zoom: Math.max(map.getZoom() + 2, PILL_ZOOM),
          speed: 1.2,
        });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([centerLng, centerLat])
        .addTo(map);
      markers.current.push(marker);
    }
  }

  // hover/選択連動: 強調ピンを拡大（ピル表示中のみ。クラスタ表示中は markerEls が空）
  const activeId = selectedId ?? highlightedId;
  const applyActive = () => {
    markerEls.current.forEach((inner, id) => {
      const markerEl = inner.parentElement;
      if (id === activeId) {
        inner.style.transform = 'scale(1.12)';
        inner.style.boxShadow = 'rgba(255,159,28,0.6) 0 0 0 2px, rgba(0,0,0,0.2) 0 4px 12px 0';
        if (markerEl) markerEl.style.zIndex = '5';
      } else {
        inner.style.transform = 'scale(1)';
        inner.style.boxShadow = 'rgba(0,0,0,0.18) 0 2px 8px 0';
        if (markerEl) markerEl.style.zIndex = '';
      }
    });
  };
  useEffect(applyActive, [activeId]);

  // 選択中の出品へ地図を寄せる（カルーセルでカードを切り替えたとき）。
  // ピルが見えるズーム（PILL_ZOOM）以上まで寄せ、寄せた後に強調を反映する。
  useEffect(() => {
    if (!selectedId) return;
    const c = coords.current.get(selectedId);
    if (c && mapRef.current) {
      mapRef.current.flyTo({
        center: c,
        zoom: Math.max(mapRef.current.getZoom(), PILL_ZOOM),
        speed: 1.2,
      });
    }
  }, [selectedId]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
