import { useState } from 'react';
import type { ListingStatus } from '@/lib/types';

export interface ManageItem {
  id: string;
  title: string;
  species: string;
  isSawn: boolean;
  priceLabel: string;
  unitLabel: string;
  stockLine: string;
  status: ListingStatus;
  thumb: string;
}

interface Props {
  items: ManageItem[];
}

const STATUS_LABEL: Record<ListingStatus, string> = {
  published: '公開中',
  sold: '売切れ',
  closed: '公開停止',
};

const STATUS_STYLE: Record<ListingStatus, string> = {
  published: 'bg-primary-tint text-[#8a4f00]',
  sold: 'bg-surface-muted text-ink-sub',
  closed: 'bg-surface-muted text-ink-sub',
};

const STATUS_ORDER: ListingStatus[] = ['published', 'sold', 'closed'];

export function ManageList({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function changeStatus(id: string, status: ListingStatus) {
    setBusyId(id);
    setError('');
    const prev = items;
    setItems((list) => list.map((it) => (it.id === id ? { ...it, status } : it)));
    try {
      const res = await fetch('/api/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statusOnly: true, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev); // ロールバック
      setError('ステータスの変更に失敗しました。');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch('/api/listings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setItems((list) => list.filter((it) => it.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setError('削除に失敗しました。');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-8 text-center">
        <p className="text-[14px] text-ink-sub">まだ出品がありません。</p>
        <a
          href="/sell"
          className="mt-4 inline-flex h-11 items-center rounded-btn bg-primary px-5 text-[15px] font-bold text-ink no-underline transition-colors hover:bg-primary-active"
        >
          商品を出品する
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
      {items.map((it) => (
        <div
          key={it.id}
          className="rounded-card border border-hairline bg-surface p-3 shadow-card"
        >
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-[10px] bg-surface-muted">
              {it.thumb ? (
                <img src={it.thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[11px] text-ink-faint">
                  写真なし
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-semibold">{it.title}</span>
                <span
                  className={`flex-shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[it.status]}`}
                >
                  {STATUS_LABEL[it.status]}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-ink-sub">
                {it.species} ・ {it.stockLine}
              </div>
              <div className="mt-0.5 text-[15px] font-bold">
                {it.priceLabel}
                <span className="text-[12px] font-normal text-ink-sub">{it.unitLabel}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <a
              href={`/sell/edit/${it.id}`}
              className="inline-flex h-9 items-center rounded-pill border border-border-strong bg-surface px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-surface-muted"
            >
              編集
            </a>
            <select
              value={it.status}
              disabled={busyId === it.id}
              onChange={(e) => changeStatus(it.id, e.target.value as ListingStatus)}
              aria-label="ステータス変更"
              className="h-9 rounded-pill border border-border-strong bg-surface px-3 text-[13px] text-ink outline-none disabled:opacity-50"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(it.id)}
              disabled={busyId === it.id}
              className="ml-auto inline-flex h-9 items-center rounded-pill border border-border-strong bg-surface px-3.5 text-[13px] font-medium text-danger hover:bg-surface-muted disabled:opacity-50"
            >
              削除
            </button>
          </div>
        </div>
      ))}

      {/* 削除確認ダイアログ */}
      {confirmDeleteId && (
        <>
          <div
            onClick={() => busyId === null && setConfirmDeleteId(null)}
            className="fixed inset-0 z-[70] bg-black/50"
            style={{ animation: 'overlayFadeIn 0.2s ease' }}
          />
          <div
            className="fixed left-1/2 top-1/2 z-[71] w-[90%] max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-card bg-surface p-5"
            role="dialog"
            aria-modal="true"
          >
            <span className="text-[17px] font-semibold">この出品を削除しますか？</span>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-sub">
              削除すると元に戻せません。一時的に非公開にしたい場合は「公開停止」をご利用ください。
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={busyId !== null}
                className="h-11 flex-1 rounded-btn border border-ink bg-surface text-[15px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => remove(confirmDeleteId)}
                disabled={busyId !== null}
                className="h-11 flex-1 rounded-btn bg-danger text-[15px] font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busyId === confirmDeleteId ? '削除中…' : '削除する'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
