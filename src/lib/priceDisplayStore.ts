// 価格表示モード（立米単価 ⇄ 1枚あたり）のグローバルストア（クライアント専用シングルトン）。
// 全 React アイランド（一覧カード・詳細・カート）が同じモードを共有し、
// useSyncExternalStore 経由で即時同期する。localStorage で再訪時も維持、別タブは storage イベントで同期。

import { useSyncExternalStore } from 'react';
import type { PriceDisplayMode } from './format';

const KEY = 'zaimoku.priceMode.v1';
const isBrowser = typeof window !== 'undefined';

let mode: PriceDisplayMode = 'volume';
let initialized = false;
const listeners = new Set<() => void>();

function readStorage(): PriceDisplayMode {
  if (!isBrowser) return 'volume';
  try {
    return window.localStorage.getItem(KEY) === 'piece' ? 'piece' : 'volume';
  } catch {
    return 'volume';
  }
}

function ensureInit(): void {
  if (initialized || !isBrowser) return;
  initialized = true;
  mode = readStorage();
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== KEY) return;
    mode = readStorage();
    notify();
  });
}

function notify(): void {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void): () => void {
  ensureInit();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): PriceDisplayMode {
  ensureInit();
  return mode;
}

/** SSR は常に立米単価（ハイドレーション後に localStorage を反映）。 */
function getServerSnapshot(): PriceDisplayMode {
  return 'volume';
}

export function setPriceMode(next: PriceDisplayMode): void {
  ensureInit();
  if (mode === next) return;
  mode = next;
  if (isBrowser) {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // 容量超過等は黙殺（表示設定であり致命的でない）。
    }
  }
  notify();
}

export function togglePriceMode(): void {
  setPriceMode(getSnapshot() === 'volume' ? 'piece' : 'volume');
}

/** 現在の価格表示モードを購読する React フック。 */
export function usePriceMode(): PriceDisplayMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
