// 郵便番号から住所（都道府県・市区町村）を引くクライアント用ユーティリティ。
// zipcloud の公開 API（zip-cloud.appspot.com・CORS 対応・無料）を使う。
// ネットワーク不通や該当なしは null。

export interface PostalAddress {
  prefecture: string;
  /** 市区町村＋町域（例: 伊那市高遠町山室） */
  city: string;
}

/** 郵便番号（ハイフン有無どちらでも）を7桁数字に正規化。7桁でなければ null。 */
export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length === 7 ? digits : null;
}

/**
 * 郵便番号から住所を引く。7桁でない・該当なし・通信失敗はいずれも null を返す
 * （フォームは手入力にフォールバックできる）。
 */
export async function lookupPostalCode(raw: string): Promise<PostalAddress | null> {
  const code = normalizePostalCode(raw);
  if (!code) return null;
  try {
    const res = await fetch(`https://zip-cloud.appspot.com/api/search?zipcode=${code}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { address1: string; address2: string; address3: string }[] | null;
    };
    const r = json.results?.[0];
    if (!r) return null;
    return {
      prefecture: r.address1,
      // 市区町村（address2）＋町域（address3）を結合。
      city: `${r.address2}${r.address3}`,
    };
  } catch {
    return null;
  }
}
