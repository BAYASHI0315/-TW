// Equipment Manager Lite v21.1 CSV Export
// Googleスプレッドシートに取り込みやすいCSV出力を追加します。
// 既存のv20.1/v20.2/v21に追加するだけで動きます。

function csvTodayStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function csvSafeText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows) {
  const safeRows = rows && rows.length ? rows : [{ メモ: 'データがありません' }];
  const headers = [...new Set(safeRows.flatMap(row => Object.keys(row)))];
  const lines = [
    headers.map(csvEscape).join(','),
    ...safeRows.map(row => headers.map(h => csvEscape(row[h])).join(','))
  ];
  // BOM付きUTF-8。Excel/Googleスプレッドシートで日本語文字化けしにくい。
  return '\ufeff' + lines.join('\r\n');
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getCsvAppData() {
  if (!window.EquipmentManagerApp?.getData) {
    alert('アプリデータを取得できませんでした。ページを再読み込みしてから試してください。');
    return null;
  }
  return window.EquipmentManagerApp.getData();
}

function getEquipmentRows() {
  const data = getCsvAppData();
  if (!data) return null;
  return (data.equipment || []).map((a, index) => ({
    No: index + 1,
    カテゴリ: a.category || '',
    管理ID: a.id || '',
    メーカー: a.manufacturer || '',
    機材名: a.name || '',
    在庫数: Number(a.quantity || 0),
    状態: a.status || '',
    新品価格: Number(a.newPrice || 0),
    レンタル日額: Number(a.rentalDay || 0),
    取扱説明書URL: a.manualUrl || '',
    商品画像URL: a.imageUrl || '',
    商品ページURL: a.productUrl || '',
    シリアル: a.serial || '',
    消耗品: a.consumable ? 'はい' : 'いいえ',
    備考: a.notes || ''
  }));
}

function getCategorySummaryRows() {
  const rows = getEquipmentRows();
  if (!rows) return null;
  return Object.entries(rows.reduce((acc, row) => {
    const cat = row.カテゴリ || '未分類';
    if (!acc[cat]) acc[cat] = {
      カテゴリ: cat,
      機材種類数: 0,
      在庫数合計: 0,
      新品価格合計: 0,
      レンタル日額合計: 0
    };
    acc[cat].機材種類数 += 1;
    acc[cat].在庫数合計 += Number(row.在庫数 || 0);
    acc[cat].新品価格合計 += Number(row.新品価格 || 0) * Number(row.在庫数 || 0);
    acc[cat].レンタル日額合計 += Number(row.レンタル日額 || 0) * Number(row.在庫数 || 0);
    return acc;
  }, {})).map(([, v]) => v);
}

function getCheckoutMetaCsv() {
  const meta = csvSafeText(document.querySelector('#printMeta')?.innerText || '');
  const obj = {};
  meta.split(/\n/).forEach(line => {
    const [key, ...rest] = line.split('：');
    if (key && rest.length) obj[key.trim()] = rest.join('：').trim();
  });
  return obj;
}

function getCheckoutRowsFromDomCsv() {
  const rows = [];
  const tbody = document.querySelector('#checklistBody');
  if (!tbody) return rows;

  let currentCategory = '';
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    if (tr.classList.contains('category-row')) {
      currentCategory = csvSafeText(tr.innerText).replace(/^[■●\s]+/, '');
      return;
    }

    const cells = [...tr.children];
    if (cells.length < 8) return;

    // v20系の標準想定:
    // 0持出 / 1返却印刷列 / 2カテゴリ / 3メーカー / 4機材 / 5在庫数 / 6持出数 / 7メモ / 8管理ID
    const checkout = cells[0]?.querySelector('input[type="checkbox"]')?.checked ? 'TRUE' : 'FALSE';
    const checkoutQty = cells[6]?.querySelector('input')?.value ?? csvSafeText(cells[6]?.innerText);

    rows.push({
      持出対象: checkout,
      返却確認: '',
      カテゴリ: csvSafeText(cells[2]?.innerText) || currentCategory,
      メーカー: csvSafeText(cells[3]?.innerText),
      機材名: csvSafeText(cells[4]?.innerText),
      在庫数: csvSafeText(cells[5]?.innerText),
      持出数: checkoutQty,
      メモ: csvSafeText(cells[7]?.innerText),
      管理ID: csvSafeText(cells[8]?.innerText)
    });
  });
  return rows;
}

function getProjectRowsCsv() {
  const meta = getCheckoutMetaCsv();
  return [
    { 項目: '案件名', 内容: meta['案件'] || '' },
    { 項目: '日程', 内容: meta['日程'] || '' },
    { 項目: '現場', 内容: meta['現場'] || '' },
    { 項目: 'クライアント', 内容: meta['クライアント'] || '' },
    { 項目: 'カテゴリ', 内容: meta['カテゴリ'] || '' },
    { 項目: '書き出し日時', 内容: new Date().toLocaleString('ja-JP') }
  ];
}

function sanitizeCsvFilename(name) {
  return (name || 'export').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'export';
}

function exportEquipmentMasterCsv() {
  const rows = getEquipmentRows();
  if (!rows) return;
  downloadCsv(`equipment-master-${csvTodayStamp()}.csv`, rows);
}

function exportCategorySummaryCsv() {
  const rows = getCategorySummaryRows();
  if (!rows) return;
  downloadCsv(`equipment-category-summary-${csvTodayStamp()}.csv`, rows);
}

function exportCheckoutCsv() {
  const rows = getCheckoutRowsFromDomCsv();
  const meta = getCheckoutMetaCsv();
  const projectName = sanitizeCsvFilename(meta['案件'] || 'checkout');
  downloadCsv(`${projectName}-checkout-${csvTodayStamp()}.csv`, rows);
}

function exportCheckoutOnlyCsv() {
  const rows = getCheckoutRowsFromDomCsv().filter(r => r.持出対象 === 'TRUE');
  const meta = getCheckoutMetaCsv();
  const projectName = sanitizeCsvFilename(meta['案件'] || 'checkout-selected');
  downloadCsv(`${projectName}-checkout-selected-${csvTodayStamp()}.csv`, rows);
}

function exportProjectInfoCsv() {
  const rows = getProjectRowsCsv();
  const meta = getCheckoutMetaCsv();
  const projectName = sanitizeCsvFilename(meta['案件'] || 'project-info');
  downloadCsv(`${projectName}-project-info-${csvTodayStamp()}.csv`, rows);
}

function makeCsvButton(label, onClick, variant = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${variant}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', () => {
    try {
      onClick();
    } catch (err) {
      console.error(err);
      alert(err.message || 'CSV書き出しに失敗しました。');
    }
  });
  return btn;
}

function installCsvButtons() {
  if (document.body.dataset.v211CsvInstalled === 'true') return;
  document.body.dataset.v211CsvInstalled = 'true';

  const assetPanel = document.querySelector('#view-assets .panel-head') || document.querySelector('#view-assets .panel');
  if (assetPanel) {
    const wrap = document.createElement('div');
    wrap.className = 'button-row csv-export-row no-print';
    wrap.appendChild(makeCsvButton('機材マスターCSV出力', exportEquipmentMasterCsv, 'primary'));
    wrap.appendChild(makeCsvButton('カテゴリ集計CSV出力', exportCategorySummaryCsv));
    assetPanel.insertAdjacentElement('afterend', wrap);
  }

  const checkoutArea = document.querySelector('#view-checkout .print-title') || document.querySelector('#view-checkout .print-area');
  if (checkoutArea) {
    const wrap = document.createElement('div');
    wrap.className = 'button-row csv-export-row no-print';
    wrap.appendChild(makeCsvButton('チェックシートCSV出力', exportCheckoutCsv, 'primary'));
    wrap.appendChild(makeCsvButton('持出対象のみCSV出力', exportCheckoutOnlyCsv));
    wrap.appendChild(makeCsvButton('案件情報CSV出力', exportProjectInfoCsv));
    checkoutArea.insertAdjacentElement('afterend', wrap);
  }

  const toolsView = document.querySelector('#view-tools .panel');
  if (toolsView) {
    const box = document.createElement('div');
    box.className = 'panel glass no-print';
    box.innerHTML = '<div class="panel-head"><h2>CSV書き出し</h2><span class="chip save">v21.1</span></div><p class="hint">Googleスプレッドシートに取り込みやすいCSV形式で保存できます。</p>';
    const row = document.createElement('div');
    row.className = 'button-row';
    row.appendChild(makeCsvButton('機材マスターCSV出力', exportEquipmentMasterCsv, 'primary'));
    row.appendChild(makeCsvButton('カテゴリ集計CSV出力', exportCategorySummaryCsv));
    row.appendChild(makeCsvButton('チェックシートCSV出力', exportCheckoutCsv));
    row.appendChild(makeCsvButton('持出対象のみCSV出力', exportCheckoutOnlyCsv));
    box.appendChild(row);
    toolsView.insertAdjacentElement('beforebegin', box);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installCsvButtons);
} else {
  installCsvButtons();
}

// タブ移動や描画遅延対策
setTimeout(installCsvButtons, 500);
setTimeout(installCsvButtons, 1500);
