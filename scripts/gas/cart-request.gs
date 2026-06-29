/**
 * 伊那材木センター — カートまとめ購入リクエスト受信用 Apps Script Web App。
 *
 * 役割:
 *   1. サイト（/api/cart-request → postCartRequestToWebhook）からの POST を受け取る
 *   2. スプレッドシートに1リクエスト＝複数行で蓄積する
 *   3. 運営の指定アドレスへメールを送る（MailApp。Resend・ドメイン認証不要）
 *
 * セットアップ手順は同ディレクトリの README.md を参照。
 */

var SHEET_NAME_DEFAULT = 'purchase_requests';
var HEADERS = [
  '受信日時', 'リクエストID', '購入者名', '購入者ID',
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
    sendMail_(props, body, items);

    return jsonOutput({ ok: true, requestId: requestId });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
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
      it.title || '',
      it.sellerName || '',
      it.qty || 0,
      it.estimatedTotal || 0,
      body.grandTotal || 0,
      body.message || '',
    ]);
  });
}

/** 運営の指定アドレスへ通知メールを送る。 */
function sendMail_(props, body, items) {
  var to = props.getProperty('NOTIFY_EMAIL');
  if (!to) return; // 宛先未設定なら送らない（蓄積だけ行う）。

  var lines = [];
  lines.push('伊那材木センターに複数材のまとめ購入リクエストが届きました。');
  lines.push('購入希望者と各出品者の間の調整をお願いします。');
  lines.push('');
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
  lines.push('');
  lines.push('【購入希望者】');
  lines.push('氏名: ' + (body.buyerName || ''));
  if (body.message) {
    lines.push('');
    lines.push('【メッセージ】');
    lines.push(body.message);
  }
  lines.push('');
  lines.push('— 伊那材木センター（自動送信）');

  var subject = '【まとめ購入リクエスト】' + (body.buyerName || '') + ' 様より ' + items.length + '件';

  MailApp.sendEmail({
    to: to, // カンマ区切りで複数宛先可
    subject: subject,
    body: lines.join('\n'),
  });
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
