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
/** ブランドのアクセント色（クラスタ丸・強調リング）。 */
const ACCENT = '#FF9F1C';
/** 縦積みピルのピクセル間隔。 */
const PILL_STACK_PX = 36;

/** マーカー用の静的スタイル断片（生成のたびに組み立てず定数を代入する）。 */
const BUTTON_RESET_CSS = 'background:none;border:none;padding:0;cursor:pointer;font-family:inherit';
const PILL_INNER_CSS = [
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
const PILL_LABEL_CSS = 'font-size:12px;font-weight:600;color:#222222';
const PILL_SHADOW = 'rgba(0,0,0,0.18) 0 2px 8px 0';
const PILL_SHADOW_ACTIVE = 'rgba(255,159,28,0.6) 0 0 0 2px, rgba(0,0,0,0.2) 0 4px 12px 0';

/** クラスタ丸の直径（件数の桁で少し大きく）。 */
function clusterCircleSize(count: number): number {
  if (count >= 10) return 44;
  if (count >= 5) return 40;
  return 34;
}

/** maplibre は動的 import のため型は import type で参照する。 */
type MlMap = import('maplibre-gl').Map;
type MlMarker = import('maplibre-gl').Marker;
/** maplibre-gl モジュールの型（Marker 等のコンストラクタを持つ名前空間）。 */
type Maplibre = typeof import('maplibre-gl');

/** クラスタ1つ分（セルキー・件数・重心の経緯度）。 */
interface Cluster {
  key: string;
  count: number;
  center: [number, number];
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
  // 直近に描画した内容のシグネチャ。'pill' か、クラスタのセル集合キー。
  // これが変わらなければパン等では再描画しない（moveend の空振りを抑止）。
  const renderedSig = useRef<string | null>(null);

  // items は SSR で確定し再生成されない想定だが、最新参照を描画関数から使えるよう ref に保持。
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // 座標マップ（id -> lng/lat）。selected 連動の flyTo に使う。描画モードに依らず
  // items だけで決まるため、moveend の描画パスからは分離して items 変化時に一度だけ構築する。
  useEffect(() => {
    const m = new Map<string, [number, number]>();
    for (const item of items) m.set(item.id, [item.seller.lng, item.seller.lat]);
    coords.current = m;
  }, [items]);

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

      // 初回は load 後（project が使える）。以降の移動は moveend で拾い、
      // 描画シグネチャ（pill / クラスタのセル集合）が変わったときだけ再描画する。
      map.on('load', renderMarkers);
      map.on('moveend', renderMarkers);
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

  /**
   * 現在のズームに応じて、価格ピル or 件数クラスタでマーカー群を描画する。
   * 描画シグネチャ（pill / クラスタのセル集合）が前回と同じなら再描画しない
   * （パンや同一ズーム帯内の微動では moveend が空振りする）。
   */
  function renderMarkers() {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl) return;

    const pill = map.getZoom() >= PILL_ZOOM;
    // クラスタは表示前にセル割りを確定し、その集合をシグネチャにする。
    const clusters = pill ? null : buildClusters(map);
    const sig = pill ? 'pill' : `cluster:${clusters!.map((c) => c.key).join('|')}`;
    if (sig === renderedSig.current) return;

    clearMarkers();
    renderedSig.current = sig;

    if (pill) renderPills(map, maplibregl);
    else renderClusters(map, maplibregl, clusters!);

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
      el.style.cssText = BUTTON_RESET_CSS;

      const inner = document.createElement('span');
      inner.style.cssText = PILL_INNER_CSS;

      const dot = document.createElement('span');
      dot.style.cssText = `width:22px;height:22px;border-radius:9999px;background:${item.seller.avatarColor};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0`;
      dot.textContent = item.seller.shortLabel;

      const label = document.createElement('span');
      label.style.cssText = PILL_LABEL_CSS;
      label.textContent = item.pinLabel;

      inner.appendChild(dot);
      inner.appendChild(label);
      el.appendChild(inner);
      el.addEventListener('click', () => {
        if (onSelectRef.current) onSelectRef.current(item.id);
        else window.location.href = `/items/${item.id}`;
      });

      markerEls.current.set(item.id, inner);

      const marker = new maplibregl.Marker({ element: el, offset: [0, seen * PILL_STACK_PX] })
        .setLngLat([item.seller.lng, item.seller.lat])
        .addTo(map);
      markers.current.push(marker);
    }
  }

  /**
   * 現在のビューで、画面ピクセルのグリッド（CLUSTER_GRID_PX）ごとに出品をまとめる。
   * グルーピングも重心もピクセル空間で行い、重心を unproject して経緯度に戻す
   * （グルーピングと集約を同じ空間に統一し、広域でのズレを防ぐ）。
   */
  function buildClusters(map: MlMap): Cluster[] {
    const cells = new Map<string, { count: number; sumX: number; sumY: number }>();
    for (const item of itemsRef.current) {
      const p = map.project([item.seller.lng, item.seller.lat]);
      const key = `${Math.floor(p.x / CLUSTER_GRID_PX)}:${Math.floor(p.y / CLUSTER_GRID_PX)}`;
      const cell = cells.get(key);
      if (cell) {
        cell.count++;
        cell.sumX += p.x;
        cell.sumY += p.y;
      } else {
        cells.set(key, { count: 1, sumX: p.x, sumY: p.y });
      }
    }
    return [...cells.entries()].map(([key, c]) => {
      const center = map.unproject([c.sumX / c.count, c.sumY / c.count]);
      return { key, count: c.count, center: [center.lng, center.lat] as [number, number] };
    });
  }

  /** 件数クラスタの丸を描画。クリックでその範囲にズームインする。 */
  function renderClusters(map: MlMap, maplibregl: Maplibre, clusters: Cluster[]) {
    for (const { count, center } of clusters) {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `この付近の在庫 ${count} 件を拡大`);
      el.style.cssText = BUTTON_RESET_CSS;

      const size = clusterCircleSize(count);
      const circle = document.createElement('span');
      circle.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `width:${size}px`,
        `height:${size}px`,
        'border-radius:9999px',
        `background:${ACCENT}`,
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
        map.flyTo({ center, zoom: Math.max(map.getZoom() + 2, PILL_ZOOM), speed: 1.2 });
      });

      const marker = new maplibregl.Marker({ element: el }).setLngLat(center).addTo(map);
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
        inner.style.boxShadow = PILL_SHADOW_ACTIVE;
        if (markerEl) markerEl.style.zIndex = '5';
      } else {
        inner.style.transform = 'scale(1)';
        inner.style.boxShadow = PILL_SHADOW;
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
