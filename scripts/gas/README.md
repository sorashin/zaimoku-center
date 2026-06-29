# GAS: カートまとめ購入リクエスト受信

`cart-request.gs` は、サイトの `/api/cart-request`（`postCartRequestToWebhook`）から
POST される購入リクエストを受け取り、**スプレッドシートに蓄積**しつつ
**運営の指定アドレスへメール送信**する Google Apps Script の Web App です。

Resend やドメイン認証は不要（メールは GAS の `MailApp` が Google アカウントから送信）。

## データフロー

```
サイト /api/cart-request
   ↓ POST { token, buyerName, buyerId, items[], grandTotal, grandTotalLabel, message }
GAS Web App（doPost）
   ├─ スプレッドシートに 1材＝1行で追記
   └─ MailApp.sendEmail で運営へ通知（複数宛先可）
```

## セットアップ手順

1. 蓄積したいスプレッドシートを開く → 拡張機能 → **Apps Script** でエディタを開く
   （スプレッドシートに紐づくスクリプトにすると `SpreadsheetApp.getActive()` が使える）
2. `cart-request.gs` の中身を全部貼り付ける
3. 左メニュー「プロジェクトの設定 → スクリプト プロパティ」で登録:

   | プロパティ名 | 値 | 必須 |
   |---|---|---|
   | `NOTIFY_EMAIL` | 通知先メール。カンマ区切りで複数可（例 `a@x.com, b@y.com`） | 任意（未設定なら蓄積のみ） |
   | `SHARED_TOKEN` | サイトの `GAS_WEBHOOK_TOKEN` と同じ任意の文字列（簡易認証用） | 推奨 |
   | `SHEET_NAME` | 書き込み先シート名（既定 `purchase_requests`） | 任意 |

4. 「デプロイ → 新しいデプロイ → 種類: **ウェブアプリ**」
   - 実行するユーザー: **自分**
   - アクセスできるユーザー: **全員**
     （Cloudflare Worker からの POST は Google ログイン Cookie を持たないため。
      代わりに `SHARED_TOKEN` で簡易認証する）
   - → 発行された **Web App URL** をコピー

5. Cloudflare Pages の環境変数（Settings → Variables and secrets、Type: Secret）に登録:

   | 環境変数 | 値 |
   |---|---|
   | `GAS_WEBHOOK_URL` | 手順4の Web App URL |
   | `GAS_WEBHOOK_TOKEN` | 手順3の `SHARED_TOKEN` と同じ値 |

6. 再デプロイ（main マージ or `npm run deploy`）で反映。

## 動作確認

- 環境変数 `GAS_WEBHOOK_URL` 未設定時、サイトは送信せず `console.log` スタブのみ
  （`[cart-webhook:stub] ...`）。
- 設定後、サイトのカートから購入リクエストを送ると、スプレッドシートに行が増え、
  `NOTIFY_EMAIL` 宛にメールが届く。

## コードを更新したとき

GAS 側はリポジトリと自動同期しない。`cart-request.gs` を変更したら、
Apps Script エディタに貼り直し、**「デプロイの管理」から既存デプロイを編集 →
新バージョン**で再デプロイすること（URL は変わらない）。
