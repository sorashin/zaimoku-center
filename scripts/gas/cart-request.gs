/**
 * 伊那森林素材センター ドバドバ — カートまとめ購入リクエスト受信用 Apps Script Web App。
 *
 * 役割:
 *   1. サイト（/api/cart-request → postCartRequestToWebhook）からの POST を受け取る
 *   2. スプレッドシートに1リクエスト＝複数行で蓄積する
 *   3. 運営の指定アドレスへメールを送る（購入者の基本情報・受取方法・用途を含む）
 *   4. 購入者へ「リクエストを承りました」自動返信メールを送る
 *
 * メールはいずれも GAS の MailApp（Resend・ドメイン認証不要）。
 * セットアップ手順は同ディレクトリの README.md を参照。
 */

var SHEET_NAME_DEFAULT = 'purchase_requests';
var HEADERS = [
  '受信日時', 'リクエストID', '購入者名', '購入者ID',
  'メール', '種別', '会社名', '受取方法', '配送先', '用途',
  '品目', '出品者', '数量', '概算金額', '概算合計', 'メッセージ',
];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // 簡易認証: スクリプトプロパティの SHARED_TOKEN と照合（設定時のみ）。
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('SHARED_TOKEN');
    if (expected && body.token !== expected) {
      return jsonOutput({ ok: false, error: 'unauthorized' });
    }

    var items = body.items || [];
    if (!items.length) {
      return jsonOutput({ ok: false, error: 'no_items' });
    }

    var requestId = Utilities.getUuid().slice(0, 8);
    var now = new Date();

    appendRows_(props, now, requestId, body, items);
    sendAdminMail_(props, body, items);
    sendBuyerMail_(props, body, items, requestId);

    return jsonOutput({ ok: true, requestId: requestId });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

/** 種別コードを日本語ラベルへ。 */
function orgTypeLabel_(v) {
  return v === 'corporate' ? '法人' : v === 'individual' ? '個人' : '';
}

/** 受取方法コードを日本語ラベルへ。 */
function deliveryLabel_(v) {
  return v === 'pickup' ? '現地受け取り' : v === 'delivery' ? '配達希望' : '';
}

/** 配送先住所を1行文字列に整形（無ければ空文字）。 */
function addressLine_(addr) {
  if (!addr) return '';
  var parts = [];
  if (addr.postalCode) parts.push('〒' + addr.postalCode);
  parts.push('' + (addr.prefecture || '') + (addr.city || '') + (addr.rest || ''));
  return parts.join(' ').trim();
}

/** スプレッドシートに1材＝1行で追記する。 */
function appendRows_(props, now, requestId, body, items) {
  var sheetName = props.getProperty('SHEET_NAME') || SHEET_NAME_DEFAULT;
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  // ヘッダー行が無ければ作る。
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }

  items.forEach(function (it) {
    sheet.appendRow([
      now,
      requestId,
      body.buyerName || '',
      body.buyerId || '',
      body.buyerEmail || '',
      orgTypeLabel_(body.buyerOrgType),
      body.buyerCompany || '',
      deliveryLabel_(body.deliveryMethod),
      addressLine_(body.shippingAddress),
      body.usage || '',
      it.title || '',
      it.sellerName || '',
      it.qty || 0,
      it.estimatedTotal || 0,
      body.grandTotal || 0,
      body.message || '',
    ]);
  });
}

/** 品目・購入者情報の本文行を組み立てる（運営宛・購入者宛で共有）。 */
function buildItemLines_(body, items) {
  var lines = [];
  lines.push('■ 品目数: ' + items.length + ' 件');
  items.forEach(function (it, i) {
    lines.push('');
    lines.push((i + 1) + '. ' + it.title);
    lines.push('   出品者: ' + it.sellerName);
    lines.push('   数量: ' + it.qty);
    lines.push('   概算金額: ' + (it.estimatedTotalLabel || it.estimatedTotal));
  });
  lines.push('');
  lines.push('■ 概算合計: ' + (body.grandTotalLabel || body.grandTotal));
  return lines;
}

/** 運営の指定アドレスへ通知メールを送る（購入者の基本情報を含む）。 */
function sendAdminMail_(props, body, items) {
  var to = props.getProperty('NOTIFY_EMAIL');
  if (!to) return; // 宛先未設定なら送らない（蓄積だけ行う）。

  var lines = [];
  lines.push('伊那森林素材センター ドバドバに複数材のまとめ購入リクエストが届きました。');
  lines.push('購入希望者と各出品者の間の調整をお願いします。');
  lines.push('');
  lines = lines.concat(buildItemLines_(body, items));
  lines.push('');
  lines.push('────────────────');
  lines.push('【購入希望者】');
  lines.push('氏名: ' + (body.buyerName || ''));
  var org = orgTypeLabel_(body.buyerOrgType);
  if (org) lines.push('種別: ' + org);
  if (body.buyerCompany) lines.push('会社名: ' + body.buyerCompany);
  if (body.buyerEmail) lines.push('メール: ' + body.buyerEmail);
  var delivery = deliveryLabel_(body.deliveryMethod);
  if (delivery) lines.push('受取方法: ' + delivery);
  var addr = addressLine_(body.shippingAddress);
  if (addr) lines.push('配送先: ' + addr);
  if (body.usage) {
    lines.push('');
    lines.push('【用途・詳細】');
    lines.push(body.usage);
  }
  if (body.message) {
    lines.push('');
    lines.push('【メッセージ】');
    lines.push(body.message);
  }
  lines.push('');
  lines.push('— 伊那森林素材センター ドバドバ（自動送信）');

  var subject = '【まとめ購入リクエスト】' + (body.buyerName || '') + ' 様より ' + items.length + '件';

  var options = { to: to, subject: subject, body: lines.join('\n') };
  // 購入者メールがあれば返信先に設定（運営がそのまま返信できる）。
  if (body.buyerEmail) options.replyTo = body.buyerEmail;

  MailApp.sendEmail(options);
}

/** 購入者へ「リクエストを承りました」自動返信を送る。 */
function sendBuyerMail_(props, body, items, requestId) {
  var to = body.buyerEmail;
  if (!to) return; // メール未入力なら送れない。

  var siteName = props.getProperty('SITE_NAME') || '伊那森林素材センター ドバドバ';
  var lines = [];
  lines.push((body.buyerName || 'お客') + ' 様');
  lines.push('');
  lines.push(siteName + 'です。この度は購入リクエストをお送りいただきありがとうございます。');
  lines.push('以下の内容でリクエストを承りました。運営が在庫と受け渡し方法を確認のうえ、追ってご連絡いたします。');
  lines.push('');
  lines.push('受付番号: ' + requestId);
  lines.push('');
  lines = lines.concat(buildItemLines_(body, items));
  var delivery = deliveryLabel_(body.deliveryMethod);
  if (delivery) {
    lines.push('');
    lines.push('■ 受取方法: ' + delivery);
    var addr = addressLine_(body.shippingAddress);
    if (addr) lines.push('■ 配送先: ' + addr);
  }
  lines.push('');
  lines.push('※ このメールは自動送信です。ご不明な点はこのメールにご返信ください。');
  lines.push('');
  lines.push('— ' + siteName);

  var subject = '【' + siteName + '】購入リクエストを承りました（受付番号 ' + requestId + '）';

  var options = { to: to, subject: subject, body: lines.join('\n') };
  // 運営宛先があれば返信先に設定（購入者の返信が運営に届く）。
  var notify = props.getProperty('NOTIFY_EMAIL');
  if (notify) options.replyTo = notify;

  MailApp.sendEmail(options);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
