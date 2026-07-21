import { useState } from 'react';
import type { BuyerProfile } from '@/lib/server/data/types';
import { lookupPostalCode, normalizePostalCode } from '@/lib/postalLookup';

/** フォームが確定した購入者情報（cart-request API / webhook のフィールドに対応）。 */
export interface BuyerFormValue {
  buyerName: string;
  buyerEmail: string;
  buyerOrgType: 'corporate' | 'individual';
  buyerCompany?: string;
  deliveryMethod: 'pickup' | 'delivery';
  shippingAddress?: {
    postalCode: string;
    prefecture: string;
    city: string;
    rest?: string;
  };
  usage?: string;
}

interface Props {
  /** profiles 由来の初期値（氏名・会社名・メール）。 */
  defaults?: BuyerProfile | null;
  /** 「戻る」（カート明細へ）。 */
  onBack: () => void;
  /** 入力確定。CartDrawer が API 送信する。 */
  onSubmit: (value: BuyerFormValue) => void;
  /** 送信中（ボタン無効化）。 */
  submitting?: boolean;
}

const labelCls = 'mb-1 block text-[13px] font-medium text-ink';
const inputCls =
  'w-full rounded-btn border border-border-strong bg-surface px-3 py-2.5 text-[14px] text-ink outline-none focus:border-ink';
const reqMark = <span className="ml-0.5 text-[12px] text-red-500">*</span>;

/**
 * 購入リクエスト送信前の購入者情報フォーム。
 * 用途以外は必須。法人は会社名必須。配達希望のときのみ配送先（郵便番号→都道府県・市区町村自動入力）を必須にする。
 */
export function BuyerInfoForm({ defaults, onBack, onSubmit, submitting = false }: Props) {
  const [name, setName] = useState(defaults?.displayName ?? '');
  const [email, setEmail] = useState(defaults?.contactEmail ?? '');
  const [orgType, setOrgType] = useState<'corporate' | 'individual'>(
    defaults?.companyName ? 'corporate' : 'individual'
  );
  const [company, setCompany] = useState(defaults?.companyName ?? '');
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const [postal, setPostal] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [city, setCity] = useState('');
  const [rest, setRest] = useState('');
  const [usage, setUsage] = useState('');
  const [postalLooking, setPostalLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 郵便番号が7桁になったら住所を自動補完（手動編集も可）。
  async function onPostalChange(v: string) {
    setPostal(v);
    if (normalizePostalCode(v)) {
      setPostalLooking(true);
      const addr = await lookupPostalCode(v);
      setPostalLooking(false);
      if (addr) {
        setPrefecture(addr.prefecture);
        setCity(addr.city);
      }
    }
  }

  function validate(): BuyerFormValue | null {
    if (!name.trim()) return void setError('お名前を入力してください。'), null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return void setError('メールアドレスを正しく入力してください。'), null;
    }
    if (orgType === 'corporate' && !company.trim()) {
      return void setError('会社名を入力してください。'), null;
    }
    let shippingAddress: BuyerFormValue['shippingAddress'];
    if (delivery === 'delivery') {
      if (!postal.trim() || !prefecture.trim() || !city.trim()) {
        return void setError('配送先（郵便番号・都道府県・市区町村）を入力してください。'), null;
      }
      shippingAddress = {
        postalCode: postal.trim(),
        prefecture: prefecture.trim(),
        city: city.trim(),
        rest: rest.trim() || undefined,
      };
    }
    return {
      buyerName: name.trim(),
      buyerEmail: email.trim(),
      buyerOrgType: orgType,
      buyerCompany: orgType === 'corporate' ? company.trim() : undefined,
      deliveryMethod: delivery,
      shippingAddress,
      usage: usage.trim() || undefined,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = validate();
    if (value) onSubmit(value);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-[13px] leading-relaxed text-ink-sub">
          運営が出品者との調整を行うため、ご連絡先と受け取り方法をお知らせください。
        </p>

        {/* 氏名 */}
        <div>
          <label className={labelCls}>お名前{reqMark}</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" />
        </div>

        {/* メール */}
        <div>
          <label className={labelCls}>メールアドレス{reqMark}</label>
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <p className="mt-1 text-[11px] text-ink-faint">受付確認メールをこのアドレスにお送りします。</p>
        </div>

        {/* 種別（法人 / 個人） */}
        <div>
          <label className={labelCls}>ご利用形態{reqMark}</label>
          <div className="flex gap-2">
            {(['individual', 'corporate'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setOrgType(v)}
                aria-pressed={orgType === v}
                className={`flex-1 rounded-btn border px-3 py-2.5 text-[14px] font-medium transition-colors ${
                  orgType === v
                    ? 'border-ink bg-ink text-surface'
                    : 'border-border-strong bg-surface text-ink'
                }`}
              >
                {v === 'individual' ? '個人' : '法人'}
              </button>
            ))}
          </div>
        </div>

        {/* 会社名（法人時のみ必須） */}
        {orgType === 'corporate' && (
          <div>
            <label className={labelCls}>会社名{reqMark}</label>
            <input
              className={inputCls}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="株式会社〇〇"
            />
          </div>
        )}

        {/* 受け取り方法 */}
        <div>
          <label className={labelCls}>受け取り方法{reqMark}</label>
          <div className="flex gap-2">
            {(['pickup', 'delivery'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setDelivery(v)}
                aria-pressed={delivery === v}
                className={`flex-1 rounded-btn border px-3 py-2.5 text-[14px] font-medium transition-colors ${
                  delivery === v
                    ? 'border-ink bg-ink text-surface'
                    : 'border-border-strong bg-surface text-ink'
                }`}
              >
                {v === 'pickup' ? '現地受け取り' : '配達希望'}
              </button>
            ))}
          </div>
        </div>

        {/* 配送先（配達希望時のみ） */}
        {delivery === 'delivery' && (
          <div className="space-y-3 rounded-card border border-hairline bg-surface-muted/40 p-3">
            <div>
              <label className={labelCls}>
                郵便番号{reqMark}
                {postalLooking && <span className="ml-2 text-[11px] text-ink-faint">住所を検索中…</span>}
              </label>
              <input
                className={inputCls}
                value={postal}
                inputMode="numeric"
                onChange={(e) => onPostalChange(e.target.value)}
                placeholder="3960304"
              />
              <p className="mt-1 text-[11px] text-ink-faint">7桁入力で都道府県・市区町村を自動入力します。</p>
            </div>
            <div className="flex gap-2">
              <div className="w-[40%]">
                <label className={labelCls}>都道府県{reqMark}</label>
                <input className={inputCls} value={prefecture} onChange={(e) => setPrefecture(e.target.value)} placeholder="長野県" />
              </div>
              <div className="flex-1">
                <label className={labelCls}>市区町村{reqMark}</label>
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="伊那市高遠町山室" />
              </div>
            </div>
            <div>
              <label className={labelCls}>番地・建物名など</label>
              <input className={inputCls} value={rest} onChange={(e) => setRest(e.target.value)} placeholder="22" />
            </div>
          </div>
        )}

        {/* 用途（任意） */}
        <div>
          <label className={labelCls}>用途・ご相談内容（任意）</label>
          <textarea
            className={`${inputCls} min-h-[80px] resize-y`}
            value={usage}
            onChange={(e) => setUsage(e.target.value)}
            placeholder="どのような案件・製作に使いたいか、ご希望の納期などをお書きください。"
          />
        </div>

        {error && <p className="text-[13px] font-medium text-red-600">{error}</p>}
      </div>

      {/* フッター */}
      <div className="flex gap-2.5 border-t border-hairline px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-btn border border-ink bg-surface px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
        >
          戻る
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-btn bg-primary py-3 text-[15px] font-bold text-ink transition-colors hover:bg-primary-active disabled:opacity-60"
        >
          {submitting ? '送信中…' : 'リクエストを送信'}
        </button>
      </div>
    </form>
  );
}
