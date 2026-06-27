// localStorage バックドのカートストア（クライアント専用シングルトン）。
// モジュールスコープに状態を持つため、同一バンドル内の全 React アイランド
// （ヘッダーアイコン / ドロワー / 詳細の追加ボタン）が同じインスタンスを共有し、
// useSyncExternalStore 経由で即時同期する。別タブは storage イベントで同期。

import type { CartItem, CartSummary } from './types';
import { cartLineKey } from './types';

const CART_KEY = 'zaimoku.cart.v1';
/** 非React側（is:inline スクリプト等）も購読できるカスタムイベント名 */
export const CART_CHANGE_EVENT = 'cart:change';
/** ドロワーを開くためのカスタムイベント名 */
export const CART_OPEN_EVENT = 'cart:open';

const isBrowser = typeof window !== 'undefined';

let items: CartItem[] = [];
let initialized = false;
const listeners = new Set<() => void>();

/** スナップショットの安定参照を保つためのキャッシュ（集計は items 変更時のみ作り直す）。 */
let summaryCache: CartSummary = { count: 0, totalQty: 0 };

function recomputeSummary(): void {
  summaryCache = {
    count: items.length,
    totalQty: items.reduce((sum, it) => sum + it.qty, 0),
  };
}

function readStorage(): CartItem[] {
  if (!isBrowser) return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 最低限の形だけ検証して破損エントリを除外。
    return parsed.filter(
      (it): it is CartItem =>
        it && typeof it.listingId === 'string' && typeof it.qty === 'number'
    );
  } catch {
    return [];
  }
}

function ensureInit(): void {
  if (initialized || !isBrowser) return;
  initialized = true;
  items = readStorage();
  recomputeSummary();
  // 別タブでの変更を取り込む。
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== CART_KEY) return;
    items = readStorage();
    recomputeSummary();
    notify();
  });
}

function notify(): void {
  for (const cb of listeners) cb();
}

function persist(): void {
  recomputeSummary();
  if (isBrowser) {
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      // 容量超過等は黙殺（カートは下書きであり致命的でない）。
    }
    // 同一タブの非React購読者向け。React 側は subscribe で受け取る。
    window.dispatchEvent(new Event(CART_CHANGE_EVENT));
  }
  notify();
}

// ===== 公開 API =====

export function subscribe(cb: () => void): () => void {
  ensureInit();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** items の安定参照を返す（変更時のみ新参照に差し替わる）。 */
export function getSnapshot(): CartItem[] {
  ensureInit();
  return items;
}

/** SSR では常に空（ハイドレーション後に localStorage を反映）。 */
export function getServerSnapshot(): CartItem[] {
  return EMPTY;
}
const EMPTY: CartItem[] = [];

export function getSummary(): CartSummary {
  ensureInit();
  return summaryCache;
}

/**
 * カートに追加する。同一行（listingId+variantId）が既にあれば数量を加算（上限なし。
 * 在庫上限は送信時にサーバーが再正規化する）。irregular は常に 1 に固定。
 * パターン違いは別行として保持する。
 */
export function addItem(item: CartItem): void {
  ensureInit();
  const key = cartLineKey(item);
  const idx = items.findIndex((it) => cartLineKey(it) === key);
  if (idx >= 0) {
    const existing = items[idx];
    const nextQty =
      item.shape === 'irregular' ? 1 : existing.qty + Math.max(1, item.qty);
    const next = items.slice();
    next[idx] = { ...existing, ...item, qty: nextQty };
    items = next;
  } else {
    const qty = item.shape === 'irregular' ? 1 : Math.max(1, item.qty);
    items = [...items, { ...item, qty }];
  }
  persist();
}

/** 数量を設定する（1 未満は 1 に丸め）。irregular は 1 固定。key は cartLineKey。 */
export function updateQty(lineKey: string, qty: number): void {
  ensureInit();
  const idx = items.findIndex((it) => cartLineKey(it) === lineKey);
  if (idx < 0) return;
  const existing = items[idx];
  const nextQty = existing.shape === 'irregular' ? 1 : Math.max(1, Math.floor(qty));
  if (nextQty === existing.qty) return;
  const next = items.slice();
  next[idx] = { ...existing, qty: nextQty };
  items = next;
  persist();
}

export function removeItem(lineKey: string): void {
  ensureInit();
  const next = items.filter((it) => cartLineKey(it) !== lineKey);
  if (next.length === items.length) return;
  items = next;
  persist();
}

export function clear(): void {
  ensureInit();
  if (items.length === 0) return;
  items = [];
  persist();
}

/** ドロワーを開くイベントを発火（CartButton から呼ぶ）。 */
export function openCart(): void {
  if (isBrowser) window.dispatchEvent(new Event(CART_OPEN_EVENT));
}
