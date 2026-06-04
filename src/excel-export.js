// Equipment Manager Lite v21 Excel Export
// 既存のv20.2に追加するだけで、機材マスターと持ち出し・返却チェックシートをExcel出力できます。

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const old = document.querySelector('script[data-sheetjs="true"]');
    if (old) {
      old.addEventListener('load', () => resolve(window.XLSX));
      old.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.async = true;
    script.dataset.sheetjs = 'true';
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJSの読み込みに失敗しました。'));
    script.onerror = () => reject(new Error('SheetJS CDNを読み込めませんでした。インターネット接続を確認してください。'));
    document.head.appendChild(script);
  });
}

function todayStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function safeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getAppData() {
  if (!window.EquipmentManagerApp?.getData) {
    alert('アプリデータを取得できませんでした。ページを再読み込みしてから試してください。');
    return null;
  }
  return window.EquipmentManagerApp.getData();
}

function autosizeWorksheet(ws, rows) {
  const widths = [];
  rows.forEach(row => {
    Object.values(row).forEach((value, i) => {
      const len = String(value ?? '').length;
      widths[i] = Math.max(widths[i] || 10, Math.min(Math.max(len + 2, 10), 42));
    });
  });
  ws['!cols'] = widths.map(wch => ({ wch }));
}

function addWorkbookSheet(XLSX, wb, name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ メモ: 'データがありません' }]);
  autosizeWorksheet(ws, rows.length ? rows : [{ メモ: 'データがありません' }]);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

function downloadWorkbook(XLSX, wb, filename) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', compression: true });
}

async function exportEquipmentMasterExcel() {
  const data = getAppData();
  if (!data) return;
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();

  const rows = (data.equipment || []).map((a, index) => ({
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

  addWorkbookSheet(XLSX, wb, '機材マスター', rows);

  const categorySummary = Object.entries(rows.reduce((acc, row) => {
    const cat = row.カテゴリ || '未分類';
    if (!acc[cat]) acc[cat] = { カテゴリ: cat, 機材種類数: 0, 在庫数合計: 0, 新品価格合計: 0 };
    acc[cat].機材種類数 += 1;
    acc[cat].在庫数合計 += Number(row.在庫数 || 0);
    acc[cat].新品価格合計 += Number(row.新品価格 || 0) * Number(row.在庫数 || 0);
    return acc;
  }, {})).map(([, v]) => v);
  addWorkbookSheet(XLSX, wb, 'カテゴリ集計', categorySummary);

  downloadWorkbook(XLSX, wb, `equipment-master-${todayStamp()}.xlsx`);
}

function getCheckoutMeta() {
  const meta = safeText(document.querySelector('#printMeta')?.innerText || '');
  const obj = {};
  meta.split(/\n/).forEach(line => {
    const [key, ...rest] = line.split('：');
    if (key && rest.length) obj[key.trim()] = rest.join('：').trim();
  });
  return obj;
}

function getCheckoutRowsFromDom() {
  const rows = [];
  const tbody = document.querySelector('#checklistBody');
  if (!tbody) return rows;

  let currentCategory = '';
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    if (tr.classList.contains('category-row')) {
      currentCategory = safeText(tr.innerText);
      rows.push({
        持出: '',
        返却: '',
        カテゴリ: currentCategory,
        メーカー: '',
        機材名: '【カテゴリ見出し】',
        在庫数: '',
        持出数: '',
        メモ: '',
        管理ID: ''
      });
      return;
    }

    const cells = [...tr.children];
    if (cells.length < 9) return;
    const checkout = cells[0]?.querySelector('input[type="checkbox"]')?.checked ? '☑' : '□';
    const checkoutQty = cells[6]?.querySelector('input')?.value ?? safeText(cells[6]?.innerText);
    rows.push({
      持出: checkout,
      返却: '□',
      カテゴリ: safeText(cells[2]?.innerText) || currentCategory,
      メーカー: safeText(cells[3]?.innerText),
      機材名: safeText(cells[4]?.innerText),
      在庫数: safeText(cells[5]?.innerText),
      持出数: checkoutQty,
      メモ: safeText(cells[7]?.innerText),
      管理ID: safeText(cells[8]?.innerText)
    });
  });
  return rows;
}

async function exportCheckoutExcel() {
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();
  const meta = getCheckoutMeta();
  const rows = getCheckoutRowsFromDom();

  const metaRows = [
    { 項目: '案件名', 内容: meta['案件'] || '' },
    { 項目: '日程', 内容: meta['日程'] || '' },
    { 項目: '現場', 内容: meta['現場'] || '' },
    { 項目: 'クライアント', 内容: meta['クライアント'] || '' },
    { 項目: 'カテゴリ', 内容: meta['カテゴリ'] || '' },
    { 項目: '書き出し日時', 内容: new Date().toLocaleString('ja-JP') }
  ];

  addWorkbookSheet(XLSX, wb, '案件情報', metaRows);
  addWorkbookSheet(XLSX, wb, '持出返却チェック', rows);

  const onlyCheckout = rows.filter(r => r.機材名 && r.機材名 !== '【カテゴリ見出し】' && r.持出 === '☑');
  addWorkbookSheet(XLSX, wb, '持出対象のみ', onlyCheckout);

  const projectName = (meta['案件'] || 'checkout').replace(/[\\/:*?"<>|]/g, '').slice(0, 30) || 'checkout';
  downloadWorkbook(XLSX, wb, `${projectName}-checkout-${todayStamp()}.xlsx`);
}

function makeButton(label, onClick, variant = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${variant}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = 'Excel作成中...';
      await onClick();
      btn.textContent = old;
    } catch (err) {
      console.error(err);
      alert(err.message || 'Excel書き出しに失敗しました。');
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function installExcelButtons() {
  if (document.querySelector('[data-v21-excel-installed]')) return;
  document.body.dataset.v21ExcelInstalled = 'true';

  const assetPanel = document.querySelector('#view-assets .panel-head') || document.querySelector('#view-assets .panel');
  if (assetPanel) {
    const wrap = document.createElement('div');
    wrap.className = 'button-row excel-export-row';
    wrap.dataset.v21ExcelInstalled = 'true';
    wrap.appendChild(makeButton('機材マスターExcel出力', exportEquipmentMasterExcel, 'primary'));
    assetPanel.insertAdjacentElement('afterend', wrap);
  }

  const checkoutSummary = document.querySelector('#view-checkout .print-title') || document.querySelector('#view-checkout .print-area');
  if (checkoutSummary) {
    const wrap = document.createElement('div');
    wrap.className = 'button-row excel-export-row no-print';
    wrap.dataset.v21ExcelInstalled = 'true';
    wrap.appendChild(makeButton('チェックシートExcel出力', exportCheckoutExcel, 'primary'));
    checkoutSummary.insertAdjacentElement('afterend', wrap);
  }

  const toolsView = document.querySelector('#view-tools .panel');
  if (toolsView) {
    const box = document.createElement('div');
    box.className = 'panel glass no-print';
    box.dataset.v21ExcelInstalled = 'true';
    box.innerHTML = '<div class="panel-head"><h2>Excel書き出し</h2><span class="chip save">v21</span></div><p class="hint">機材マスターと持ち出し・返却チェックシートを.xlsx形式でローカル保存できます。</p>';
    const row = document.createElement('div');
    row.className = 'button-row';
    row.appendChild(makeButton('機材マスターExcel出力', exportEquipmentMasterExcel, 'primary'));
    row.appendChild(makeButton('チェックシートExcel出力', exportCheckoutExcel));
    box.appendChild(row);
    toolsView.insertAdjacentElement('beforebegin', box);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installExcelButtons);
} else {
  installExcelButtons();
}

// タブ切替後にDOMが再描画されてもボタンが残るように軽く監視
setTimeout(installExcelButtons, 500);
setTimeout(installExcelButtons, 1500);
