import { defaultData } from './data.js';
import { initCloudSync } from './cloud-sync.js';

const STORAGE_KEY = 'equipment-manager-lite-v20';
const LEGACY_KEYS = ['equipment-manager-lite-v19', 'equipment-manager-lite-v18', 'equipment-manager-lite-v17', 'equipment-manager-lite-v16', 'equipment-manager-lite-v15', 'equipment-manager-lite-v14', 'equipment-manager-lite-v13', 'equipment-manager-lite-v12', 'equipment-manager-lite-v11', 'equipment-manager-lite-v10', 'equipment-manager-lite-v9', 'equipment-manager-lite-v8', 'equipment-manager-lite-v7', 'equipment-manager-lite-v6', 'equipment-manager-lite-v5'];
const $ = (id) => document.getElementById(id);
const clone = (obj) => JSON.parse(JSON.stringify(obj));
const today = () => new Date().toISOString().slice(0, 10);
const yen = (n) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Number(n || 0));
const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const url = (q) => encodeURIComponent(q.trim());

let db = load();
let currentAssetId = db.equipment[0]?.id || '';
let currentSetName = db.sets[0]?.name || '';
let currentResearchId = db.equipment[0]?.id || '';
let assetViewMode = localStorage.getItem('equipment-manager-asset-view') || 'card';
let setViewMode = localStorage.getItem('equipment-manager-set-view') || 'list';

function normalizeData(raw = {}) {
  const merged = { ...clone(defaultData), ...raw };
  merged.dataVersion = 20;
  merged.equipment = (merged.equipment || []).map(a => ({
    id: a.id || '',
    manufacturer: a.manufacturer || a.maker || '',
    name: a.name || '',
    category: a.category || 'その他',
    quantity: Number(a.quantity ?? 1),
    status: a.status || 'OK',
    newPrice: Number(a.newPrice || 0),
    rentalDay: Number(a.rentalDay || 0),
    manualUrl: a.manualUrl || '',
    imageUrl: a.imageUrl || '',
    productUrl: a.productUrl || '',
    serial: a.serial || '',
    notes: a.notes || '',
    consumable: Boolean(a.consumable)
  })).filter(a => a.id && a.name);
  merged.sets = (merged.sets || []).map(s => ({ name: s.name || '', description: s.description || '', equipmentIds: s.equipmentIds || [] })).filter(s => s.name);
  merged.project = { ...clone(defaultData.project), ...(merged.project || {}) };
  merged.checks = merged.checks || {};
  merged.checkoutQuantities = merged.checkoutQuantities || {};
  merged.rentalQuote = { customer: '', subject: '', issueDate: today(), days: 1, selectedIds: [], unitPrices: {}, quoteQuantities: {}, overridePrices: {}, memo: '', companyName: '', companyTel: '', companyEmail: '', companyAddress: '', paymentInfo: '', validUntil: '', ...(merged.rentalQuote || {}) };
  merged.rentalQuote.days = Number(merged.rentalQuote.days || 1);
  merged.categories = uniqueCategories(merged);
  return merged;
}
function load() {
  try {
    const own = localStorage.getItem(STORAGE_KEY);
    if (own) return normalizeData(JSON.parse(own));
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) return normalizeData(JSON.parse(legacy));
    }
    return normalizeData(defaultData);
  } catch {
    return normalizeData(defaultData);
  }
}
let suppressCloudEvent = false;
function save() {
  db.categories = uniqueCategories(db);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if (!suppressCloudEvent) {
    window.dispatchEvent(new CustomEvent('equipment-manager-data-changed', { detail: { data: clone(db) } }));
  }
}
function replaceDataFromExternal(raw, options = {}) {
  suppressCloudEvent = Boolean(options.silent);
  db = normalizeData(raw);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  suppressCloudEvent = false;
  currentAssetId = db.equipment[0]?.id || '';
  currentSetName = db.sets[0]?.name || '';
  currentResearchId = currentAssetId;
  hydrateProjectForm();
  renderAll();
  generateChecklist();
}
window.EquipmentManagerApp = {
  getData: () => clone(db),
  replaceData: replaceDataFromExternal,
  saveLocal: () => save(),
  storageKey: STORAGE_KEY,
  version: 20.1
};
function uniqueCategories(source = db) {
  const base = Array.isArray(source.categories) ? source.categories : [];
  const fromEquipment = (source.equipment || []).map(a => a.category).filter(Boolean);
  const seen = new Set();
  const ordered = [];
  [...base, ...fromEquipment].forEach(c => {
    const name = String(c || '').trim();
    if (name && !seen.has(name)) { seen.add(name); ordered.push(name); }
  });
  return ordered;
}
function categoryRank(category) {
  const idx = uniqueCategories(db).indexOf(category || 'その他');
  return idx === -1 ? 9999 : idx;
}
function getAsset(id) { return db.equipment.find(a => a.id === id); }
function checkKey(assetId, type) { return `${db.project.name || 'project'}::${assetId}::${type}`; }
function assetSearchText(a) { return [a.id, a.manufacturer, a.name, a.category, a.notes, a.serial].join(' ').toLowerCase(); }

function init() {
  bindNav(); bindProject(); bindAssets(); bindResearch(); bindOCR(); bindSets(); bindRental(); bindTools();
  $('printBtn').onclick = () => { const originalTitle = document.title; document.title = ' '; window.print(); setTimeout(() => document.title = originalTitle, 500); };
  $('exportJsonBtn').onclick = exportJson;
  $('importJsonInput').onchange = importJson;
  hydrateProjectForm(); renderAll(); generateChecklist();
}

function bindNav() {
  document.querySelectorAll('.nav').forEach(btn => btn.onclick = () => showView(btn.dataset.view));
}
function showView(view) {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  renderAll();
}

function bindProject() {
  ['projectName', 'shootDate', 'location', 'clientName', 'projectNotes'].forEach(id => $(id).oninput = () => {
    db.project.name = $('projectName').value;
    db.project.date = $('shootDate').value;
    db.project.location = $('location').value;
    db.project.client = $('clientName').value;
    db.project.notes = $('projectNotes').value;
    save(); generateChecklist();
  });
  $('generateBtn').onclick = generateChecklist;
  $('checkoutCategoryFilter').onchange = generateChecklist;
  $('clearChecksBtn').onclick = () => {
    if (!confirm('この案件のチェック状態をリセットしますか？')) return;
    const prefix = `${db.project.name || 'project'}::`;
    Object.keys(db.checks).forEach(k => { if (k.startsWith(prefix)) delete db.checks[k]; });
    save(); generateChecklist();
  };
}
function hydrateProjectForm() {
  $('projectName').value = db.project.name || '';
  $('shootDate').value = db.project.date || '';
  $('location').value = db.project.location || '';
  $('clientName').value = db.project.client || '';
  if ($('projectNotes')) $('projectNotes').value = db.project.notes || '';
}
function renderAll() {
  renderCategoryOptions(); renderCheckoutCategoryOptions(); renderAssetCategoryFilter(); renderCategoryManager(); renderSetSelector(); renderAssetEditor(); renderAssetCards(); renderResearch(); renderOCR(); renderSetEditor(); renderSetCards(); renderRental();
}
function renderCategoryOptions() {
  const select = $('assetCategorySelect');
  if (!select) return;
  const current = getAssetFormCategoryValue();
  const categories = uniqueCategories(db);
  const isKnown = categories.includes(current);
  select.innerHTML = categories.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('') +
    `<option value="__new__" ${current && !isKnown ? 'selected' : ''}>＋ 新規カテゴリを作成</option>`;
  if (!current && categories.length && !select.value) select.value = categories[0];
  syncAssetCategoryCustomVisibility(current && !isKnown ? current : '');
}
function getAssetFormCategoryValue() {
  const select = $('assetCategorySelect');
  const custom = $('assetCategoryCustom');
  if (!select) return '';
  if (select.value === '__new__') return (custom?.value || '').trim();
  return select.value || '';
}
function setAssetFormCategoryValue(category) {
  const select = $('assetCategorySelect');
  const custom = $('assetCategoryCustom');
  if (!select) return;
  const categories = uniqueCategories(db);
  if (category && categories.includes(category)) {
    select.value = category;
    if (custom) custom.value = '';
    syncAssetCategoryCustomVisibility('');
  } else if (category) {
    select.value = '__new__';
    if (custom) custom.value = category;
    syncAssetCategoryCustomVisibility(category);
  } else {
    select.value = categories[0] || '__new__';
    if (custom) custom.value = '';
    syncAssetCategoryCustomVisibility('');
  }
}
function syncAssetCategoryCustomVisibility(value = '') {
  const select = $('assetCategorySelect');
  const wrap = $('assetCategoryCustomWrap');
  const custom = $('assetCategoryCustom');
  if (!select || !wrap || !custom) return;
  const isNew = select.value === '__new__';
  wrap.classList.toggle('hidden', !isNew);
  if (isNew && value) custom.value = value;
}


function renderCheckoutCategoryOptions() {
  const el = $('checkoutCategoryFilter');
  if (!el) return;
  const current = el.value || 'すべて';
  const options = ['すべて', ...uniqueCategories(db)];
  el.innerHTML = options.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

function renderAssetCategoryFilter() {
  const el = $('assetCategoryFilter');
  if (!el) return;
  const current = el.value || 'すべて';
  const options = ['すべて', ...uniqueCategories(db)];
  el.innerHTML = options.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

function renderSetSelector() {
  $('setSelector').innerHTML = db.sets.map(s => `<label class="check-pill"><input type="checkbox" value="${esc(s.name)}" ${db.project.selectedSets?.includes(s.name) ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('') || '<p class="hint">セットがありません。セット管理で作成してください。</p>';
  $('setSelector').querySelectorAll('input').forEach(input => input.onchange = () => {
    db.project.selectedSets = [...$('setSelector').querySelectorAll('input:checked')].map(i => i.value);
    save(); generateChecklist();
  });
}
function selectedSetIds() {
  const ids = new Set();
  db.sets.filter(s => db.project.selectedSets?.includes(s.name)).forEach(s => s.equipmentIds.forEach(id => ids.add(id)));
  return ids;
}
function checkoutQtyKey(assetId) { return `${db.project.name || 'project'}::${assetId}::qty`; }
function checklistAssets() {
  const category = $('checkoutCategoryFilter')?.value || 'すべて';
  const setIds = selectedSetIds();
  return [...db.equipment]
    .filter(a => category === 'すべて' || a.category === category)
    .sort((a, b) => {
      const catRank = categoryRank(a.category) - categoryRank(b.category);
      if (catRank !== 0) return catRank;
      const setA = setIds.has(a.id) ? 0 : 1;
      const setB = setIds.has(b.id) ? 0 : 1;
      return setA - setB || (a.name || '').localeCompare(b.name || '', 'ja') || (a.id || '').localeCompare(b.id || '', 'ja');
    });
}
function generateChecklist() {
  db.project.name = $('projectName').value || db.project.name;
  const list = checklistAssets();
  const category = $('checkoutCategoryFilter')?.value || 'すべて';
  $('printMeta').innerHTML = `案件：${esc(db.project.name || '-')}<br>日程：${esc(db.project.date || '-')}<br>現場：${esc(db.project.location || '-')}<br>クライアント：${esc(db.project.client || '-')}<br>カテゴリ：${esc(category)}${db.project.notes ? `<br>備考：${esc(db.project.notes)}` : ''}`;
  const totalItems = list.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
  const checkoutTotal = list.reduce((sum, a) => sum + Number(db.checkoutQuantities[checkoutQtyKey(a.id)] ?? a.quantity ?? 0), 0);
  $('summary').innerHTML = `<div class="stat"><b>${list.length}</b><span>表示機材種</span></div><div class="stat"><b>${totalItems}</b><span>在庫数合計</span></div><div class="stat"><b>${checkoutTotal}</b><span>持出予定数</span></div>`;
  const setIds = selectedSetIds();
  let currentCategory = null;
  const rows = [];
  list.forEach(a => {
    const cat = a.category || 'その他';
    if (cat !== currentCategory) {
      currentCategory = cat;
      rows.push(`<tr class="category-row"><td colspan="9">${esc(cat)}</td></tr>`);
    }
    const qtyKey = checkoutQtyKey(a.id);
    const checkoutQty = db.checkoutQuantities[qtyKey] ?? a.quantity ?? 1;
    const qtyWarn = Number(checkoutQty || 0) > Number(a.quantity || 0) || (db.checks[checkKey(a.id, 'checkout')] && Number(checkoutQty || 0) <= 0);
    rows.push(`<tr class="${setIds.has(a.id) ? 'set-priority-row' : ''} ${qtyWarn ? 'qty-warning-row' : ''}">
      <td><input type="checkbox" data-check="${esc(a.id)}" data-type="checkout" ${db.checks[checkKey(a.id, 'checkout')] ? 'checked' : ''}></td>
      <td class="print-only-col">□</td>
      <td>${esc(cat)}</td>
      <td>${esc(a.manufacturer)}</td>
      <td><b>${esc(a.name)}</b></td>
      <td>${esc(a.quantity)}</td>
      <td><input type="number" min="0" class="checkout-qty-input" value="${esc(checkoutQty)}" data-checkout-qty="${esc(a.id)}" data-master-qty="${esc(a.quantity || 0)}"></td>
      <td>${esc(a.notes)}</td>
      <td><b>${esc(a.id)}</b></td>
    </tr>`);
  });
  $('checklistBody').innerHTML = rows.join('') || '<tr><td colspan="9">表示できる機材がありません。</td></tr>';
  document.querySelectorAll('[data-check]').forEach(input => input.onchange = () => {
    const asset = getAsset(input.dataset.check);
    db.checks[checkKey(input.dataset.check, input.dataset.type)] = input.checked;
    const qKey = checkoutQtyKey(input.dataset.check);
    if (input.checked && (!db.checkoutQuantities[qKey] || Number(db.checkoutQuantities[qKey]) <= 0)) db.checkoutQuantities[qKey] = Number(asset?.quantity || 1);
    save(); generateChecklist();
  });
  document.querySelectorAll('[data-checkout-qty]').forEach(input => input.oninput = () => { db.checkoutQuantities[checkoutQtyKey(input.dataset.checkoutQty)] = Math.max(0, Number(input.value || 0)); save(); generateChecklist(); });
  renderWarnings(list);
}
function renderWarnings(list) {
  const warns = [];
  list.filter(a => ['NG', '紛失', '要確認'].includes(a.status)).forEach(a => warns.push(`${a.id} / ${a.name} は状態が「${a.status}」です。`));
  list.filter(a => Number(a.quantity || 0) <= 0).forEach(a => warns.push(`${a.id} / ${a.name} の数量が0です。`));
  list.forEach(a => {
    const q = Number(db.checkoutQuantities[checkoutQtyKey(a.id)] ?? a.quantity ?? 0);
    const master = Number(a.quantity || 0);
    if (q > master) warns.push(`${a.id} / ${a.name} の持出数 ${q} が在庫数 ${master} を超えています。`);
    if (db.checks[checkKey(a.id, 'checkout')] && q <= 0) warns.push(`${a.id} / ${a.name} は持出チェック済みですが、持出数が0です。`);
  });
  $('warnings').innerHTML = warns.map(w => `<div class="warn">${esc(w)}</div>`).join('');
}
function statusClass(status) { if (status === 'OK') return 'ok'; if (status === '使用中') return 'busy'; if (status === '要確認') return 'warn-status'; return 'ng'; }

function bindAssets() {
  $('assetSelect').onchange = () => { currentAssetId = $('assetSelect').value; fillAssetForm(); };
  $('newAssetBtn').onclick = () => { currentAssetId = ''; fillAssetForm(null); };
  $('saveAssetBtn').onclick = saveAsset;
  $('duplicateAssetBtn').onclick = duplicateAsset;
  $('deleteAssetBtn').onclick = deleteAsset;
  $('assetSearch').oninput = renderAssetCards;
  $('assetCategoryFilter').onchange = renderAssetCards;
  if ($('assetCategorySelect')) $('assetCategorySelect').onchange = () => syncAssetCategoryCustomVisibility();
  $('assetCardViewBtn').onclick = () => { assetViewMode = 'card'; localStorage.setItem('equipment-manager-asset-view', assetViewMode); renderAssetCards(); };
  $('assetTableViewBtn').onclick = () => { assetViewMode = 'table'; localStorage.setItem('equipment-manager-asset-view', assetViewMode); renderAssetCards(); };
}
function renderAssetEditor() {
  if (!getAsset(currentAssetId)) currentAssetId = db.equipment[0]?.id || '';
  $('assetSelect').innerHTML = db.equipment.map(a => `<option value="${esc(a.id)}" ${a.id === currentAssetId ? 'selected' : ''}>${esc(a.id)} / ${esc(a.name)}</option>`).join('');
  fillAssetForm(getAsset(currentAssetId) || db.equipment[0] || null);
}
function fillAssetForm(a = getAsset(currentAssetId)) {
  if (!a) a = { id: '', manufacturer: '', name: '', category: '', quantity: 1, status: 'OK', newPrice: 0, rentalDay: 0, manualUrl: '', imageUrl: '', productUrl: '', serial: '', notes: '', consumable: false };
  $('assetId').value = a.id || ''; $('assetManufacturer').value = a.manufacturer || ''; $('assetName').value = a.name || ''; setAssetFormCategoryValue(a.category || '');
  $('assetQty').value = a.quantity ?? 1; $('assetStatus').value = a.status || 'OK'; $('assetNewPrice').value = a.newPrice || 0; $('assetRentalDay').value = a.rentalDay || 0;
  $('assetManual').value = a.manualUrl || ''; $('assetImage').value = a.imageUrl || ''; $('assetProduct').value = a.productUrl || ''; $('assetSerial').value = a.serial || ''; $('assetNotes').value = a.notes || ''; $('assetConsumable').checked = Boolean(a.consumable);
}
function readAssetForm() {
  return { id: $('assetId').value.trim(), manufacturer: $('assetManufacturer').value.trim(), name: $('assetName').value.trim(), category: getAssetFormCategoryValue() || 'その他', quantity: Number($('assetQty').value || 0), status: $('assetStatus').value, newPrice: Number($('assetNewPrice').value || 0), rentalDay: Number($('assetRentalDay').value || 0), manualUrl: $('assetManual').value.trim(), imageUrl: $('assetImage').value.trim(), productUrl: $('assetProduct').value.trim(), serial: $('assetSerial').value.trim(), notes: $('assetNotes').value.trim(), consumable: $('assetConsumable').checked };
}
function saveAsset() {
  const a = readAssetForm(); if (!a.id || !a.name) return alert('管理IDと機材名は必須です。');
  const oldId = currentAssetId;
  const duplicate = db.equipment.find(x => x.id === a.id && x.id !== oldId);
  if (duplicate) return alert(`管理ID「${a.id}」は既に使われています。別のIDを指定してください。`);
  const idx = db.equipment.findIndex(x => x.id === oldId || x.id === a.id);
  if (idx >= 0) db.equipment[idx] = a; else db.equipment.push(a);
  if (oldId && oldId !== a.id) db.sets.forEach(s => s.equipmentIds = s.equipmentIds.map(id => id === oldId ? a.id : id));
  currentAssetId = a.id; currentResearchId = a.id; save(); renderAll(); generateChecklist();
}
function duplicateAsset() {
  const a = readAssetForm();
  const base = `${a.id || 'ITEM'}-COPY`;
  let nextId = base;
  let i = 2;
  while (db.equipment.some(x => x.id === nextId)) nextId = `${base}-${i++}`;
  a.id = nextId;
  db.equipment.push(a);
  currentAssetId = a.id;
  save(); renderAll(); generateChecklist();
}
function deleteAsset() {
  if (!currentAssetId || !confirm('この機材を削除しますか？')) return;
  db.equipment = db.equipment.filter(a => a.id !== currentAssetId); db.sets.forEach(s => s.equipmentIds = s.equipmentIds.filter(id => id !== currentAssetId));
  currentAssetId = db.equipment[0]?.id || ''; save(); renderAll(); generateChecklist();
}
function renderAssetCards() {
  const q = ($('assetSearch')?.value || '').toLowerCase();
  const category = $('assetCategoryFilter')?.value || 'すべて';
  const list = db.equipment
    .filter(a => assetSearchText(a).includes(q))
    .filter(a => category === 'すべて' || a.category === category)
    .sort((a, b) => (categoryRank(a.category) - categoryRank(b.category)) || (a.name || '').localeCompare(b.name || '', 'ja'));

  $('assetCardViewBtn')?.classList.toggle('active', assetViewMode === 'card');
  $('assetTableViewBtn')?.classList.toggle('active', assetViewMode === 'table');

  if (assetViewMode === 'table') {
    $('assetCards').className = 'asset-table-wrap';
    $('assetCards').innerHTML = `<table class="dense asset-master-table"><thead><tr><th>カテゴリ</th><th>管理ID</th><th>メーカー</th><th>機材名</th><th>数量</th><th>状態</th><th>新品価格</th><th>レンタル/日</th><th>取説</th><th>商品</th></tr></thead><tbody>${list.map(a => `<tr data-card-id="${esc(a.id)}"><td>${esc(a.category)}</td><td><b>${esc(a.id)}</b></td><td>${esc(a.manufacturer)}</td><td>${esc(a.name)}</td><td>${esc(a.quantity)}</td><td><span class="status ${statusClass(a.status)}">${esc(a.status)}</span></td><td>${yen(a.newPrice)}</td><td>${yen(a.rentalDay)}</td><td>${a.manualUrl ? 'あり' : '-'}</td><td>${a.productUrl ? 'あり' : '-'}</td></tr>`).join('') || '<tr><td colspan="10">機材が見つかりません。</td></tr>'}</tbody></table>`;
  } else {
    $('assetCards').className = 'asset-grid';
    $('assetCards').innerHTML = list.map(a => `<article class="asset-card" data-card-id="${esc(a.id)}">
      <img src="${esc(a.imageUrl || 'https://placehold.co/320x200/0f172a/ffffff?text=NO+IMAGE')}" alt="">
      <div><b>${esc(a.name)}</b><small>${esc(a.id)} / ${esc(a.manufacturer || 'メーカー未入力')} / ${esc(a.category)}</small></div>
      <div class="card-foot"><span class="status ${statusClass(a.status)}">${esc(a.status)}</span><span>${yen(a.rentalDay)}/日</span></div>
      <div class="link-row">${a.manualUrl ? `<a href="${esc(a.manualUrl)}" target="_blank">取説</a>` : ''}${a.productUrl ? `<a href="${esc(a.productUrl)}" target="_blank">商品</a>` : ''}</div>
    </article>`).join('') || '<p class="hint">機材が見つかりません。</p>';
  }
  document.querySelectorAll('[data-card-id]').forEach(card => card.onclick = () => { currentAssetId = card.dataset.cardId; showView('assets'); renderAll(); });
}


function bindResearch() {
  $('researchAssetSelect').onchange = () => { currentResearchId = $('researchAssetSelect').value; fillResearchFromAsset(); };
  $('researchQuery').oninput = renderSearchLinks;
  $('applyCandidateBtn').onclick = applyCandidate;
}
function renderResearch() {
  $('researchAssetSelect').innerHTML = db.equipment.map(a => `<option value="${esc(a.id)}" ${a.id === currentResearchId ? 'selected' : ''}>${esc(a.id)} / ${esc(a.name)}</option>`).join('');
  fillResearchFromAsset(false);
}
function fillResearchFromAsset(resetInputs = true) {
  const a = getAsset(currentResearchId) || db.equipment[0]; if (!a) return;
  currentResearchId = a.id;
  $('researchQuery').value = `${a.manufacturer || ''} ${a.name || ''}`.trim();
  if (resetInputs) {
    $('candidateManual').value = a.manualUrl || ''; $('candidateImage').value = a.imageUrl || ''; $('candidateProduct').value = a.productUrl || ''; $('candidateNewPrice').value = a.newPrice || 0; $('candidateRentalDay').value = a.rentalDay || 0;
  }
  renderSearchLinks();
}
function renderSearchLinks() {
  const q = $('researchQuery').value || '';
  const links = [
    ['取扱説明書PDFを探す', `https://www.google.com/search?q=${url(q + ' 取扱説明書 PDF manual')}`],
    ['メーカー公式ページを探す', `https://www.google.com/search?q=${url(q + ' 公式')}`],
    ['商品画像を探す', `https://www.google.com/search?tbm=isch&q=${url(q)}`],
    ['新品価格を探す', `https://www.google.com/search?q=${url(q + ' 新品 価格')}`],
    ['Yahoo!ショッピングで探す', `https://shopping.yahoo.co.jp/search?p=${url(q)}`],
    ['Amazonで探す', `https://www.amazon.co.jp/s?k=${url(q)}`],
    ['レンタル価格を探す', `https://www.google.com/search?q=${url(q + ' レンタル 価格')}`]
  ];
  $('searchLinks').innerHTML = links.map(([label, href]) => `<a class="btn full" href="${href}" target="_blank" rel="noopener">${esc(label)}</a>`).join('');
}
function applyCandidate() {
  const a = getAsset(currentResearchId); if (!a) return alert('反映する機材がありません。');
  a.manualUrl = $('candidateManual').value.trim(); a.imageUrl = $('candidateImage').value.trim(); a.productUrl = $('candidateProduct').value.trim(); a.newPrice = Number($('candidateNewPrice').value || 0); a.rentalDay = Number($('candidateRentalDay').value || 0) || a.rentalDay;
  currentAssetId = a.id; save(); renderAll(); generateChecklist(); alert('機材マスターへ反映しました。');
}


function nextAssetIdFromOCR() {
  const nums = db.equipment
    .map(a => String(a.id || '').match(/^OCR(\d{3,})$/))
    .filter(Boolean)
    .map(m => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `OCR${String(next).padStart(3, '0')}`;
}
function makeAssetFromOCR() {
  const maker = $('ocrApplyManufacturer')?.value.trim() || '';
  const name = $('ocrApplyName')?.value.trim() || 'OCR新規機材';
  const serial = $('ocrApplySerial')?.value.trim() || '';
  return {
    id: nextAssetIdFromOCR(),
    manufacturer: maker,
    name,
    category: 'その他',
    quantity: 1,
    status: 'OK',
    newPrice: 0,
    rentalDay: 0,
    manualUrl: '',
    imageUrl: '',
    productUrl: '',
    serial,
    notes: 'OCR入力から新規追加',
    consumable: false
  };
}

function bindOCR() {
  const input = $('ocrImageInput'); if (!input) return;
  input.onchange = () => previewOCRImage();
  $('runOcrBtn').onclick = runOCR;
  $('clearOcrBtn').onclick = clearOCR;
  $('analyzeOcrBtn').onclick = analyzeOCRText;
  $('sendOcrToResearchBtn').onclick = sendOCRToResearch;
  $('applyOcrToAssetBtn').onclick = applyOCRToAsset;
  $('ocrAssetSelect').onchange = () => { currentAssetId = $('ocrAssetSelect').value; };
  $('ocrText').oninput = analyzeOCRText;
}
function renderOCR() {
  const select = $('ocrAssetSelect'); if (!select) return;
  const cur = currentAssetId || db.equipment[0]?.id || '';
  select.innerHTML = `<option value="__new__" ${cur === '__new__' ? 'selected' : ''}>＋ 新規機材として追加</option>` +
    db.equipment.map(a => `<option value="${esc(a.id)}" ${a.id === cur ? 'selected' : ''}>${esc(a.id)} / ${esc(a.name)}</option>`).join('');
}
function previewOCRImage() {
  const file = $('ocrImageInput')?.files?.[0];
  const img = $('ocrPreview');
  if (!file || !img) return;
  img.src = URL.createObjectURL(file);
  $('ocrProgress').textContent = '画像を読み込みました。OCR実行を押してください。';
}
async function runOCR() {
  const file = $('ocrImageInput')?.files?.[0];
  if (!file) return alert('先に画像を選択してください。');
  if (!window.Tesseract) return alert('OCRライブラリを読み込めませんでした。ネット接続を確認してください。');
  $('ocrProgress').textContent = 'OCR準備中... 初回は少し時間がかかります。';
  $('runOcrBtn').disabled = true;
  try {
    const result = await window.Tesseract.recognize(file, 'eng+jpn', {
      logger: m => {
        if (m.status) $('ocrProgress').textContent = `${m.status} ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`;
      }
    });
    $('ocrText').value = result?.data?.text || '';
    $('ocrProgress').textContent = 'OCR完了。候補を確認してください。';
    analyzeOCRText();
  } catch (err) {
    console.error(err);
    $('ocrProgress').textContent = 'OCRに失敗しました。別の写真で試してください。';
    alert('OCRに失敗しました。明るく、文字が大きく写った写真で再試行してください。');
  } finally {
    $('runOcrBtn').disabled = false;
  }
}
function clearOCR() {
  if ($('ocrImageInput')) $('ocrImageInput').value = '';
  if ($('ocrPreview')) $('ocrPreview').removeAttribute('src');
  ['ocrText', 'ocrApplyManufacturer', 'ocrApplyName', 'ocrApplySerial'].forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('ocrMakerCandidates')) $('ocrMakerCandidates').innerHTML = '';
  if ($('ocrModelCandidates')) $('ocrModelCandidates').innerHTML = '';
  if ($('ocrProgress')) $('ocrProgress').textContent = '画像を選んでください。';
}
function analyzeOCRText() {
  const text = $('ocrText')?.value || '';
  const makers = extractMakerCandidates(text);
  const models = extractModelCandidates(text);
  renderCandidatePills('ocrMakerCandidates', makers, v => { $('ocrApplyManufacturer').value = v; });
  renderCandidatePills('ocrModelCandidates', models, v => { $('ocrApplyName').value = v; });
  if (!$('ocrApplyManufacturer').value && makers[0]) $('ocrApplyManufacturer').value = makers[0];
  if (!$('ocrApplyName').value && models[0]) $('ocrApplyName').value = models[0];
}
function renderCandidatePills(id, values, onClick) {
  const el = $(id); if (!el) return;
  el.innerHTML = values.length ? values.map(v => `<button type="button" class="candidate-pill" data-candidate="${esc(v)}">${esc(v)}</button>`).join('') : '<span class="hint">候補なし</span>';
  el.querySelectorAll('[data-candidate]').forEach(btn => btn.onclick = () => onClick(btn.dataset.candidate));
}
function extractMakerCandidates(text) {
  const known = ['Sony', 'Canon', 'Nikon', 'Panasonic', 'Blackmagic Design', 'Blackmagic', 'ARRI', 'RED', 'FUJIFILM', 'Fujifilm', 'Sound Devices', 'Sennheiser', 'Shure', 'RØDE', 'RODE', 'Aputure', 'Nanlite', 'Godox', 'DJI', 'SmallRig', 'Manfrotto', 'Sachtler', 'Atomos', 'TASCAM', 'Zoom', 'Roland', 'Yamaha', 'Audio-Technica', 'Teradek', 'Hollyland', 'IDX', 'V-Mount', 'Neewer'];
  const lower = text.toLowerCase();
  const found = known.filter(k => lower.includes(k.toLowerCase()));
  const uppercaseLines = text.split(/\n/).map(x => x.trim()).filter(x => /^[A-Z][A-Z0-9 &\-.]{2,24}$/.test(x));
  return [...new Set([...found, ...uppercaseLines])].slice(0, 10);
}
function extractModelCandidates(text) {
  const cleaned = text.replace(/[‐‑–—ー]/g, '-');
  const candidates = [];
  const patterns = [
    /\b[A-Z]{1,6}[- ]?[A-Z0-9]{1,6}[- ]?[A-Z0-9]{0,6}\b/g,
    /\b[A-Z]+\d+[A-Z0-9-]*\b/g,
    /\b\d{2,4}[A-Z]{1,4}[A-Z0-9-]*\b/g
  ];
  patterns.forEach(re => {
    [...cleaned.matchAll(re)].forEach(m => {
      const v = m[0].replace(/\s+/g, ' ').trim();
      if (v.length >= 3 && !['THE','AND','FOR','WITH','MADE','JAPAN','CHINA','MODEL','SERIAL','INPUT','OUTPUT'].includes(v)) candidates.push(v);
    });
  });
  const lines = cleaned.split(/\n/).map(x => x.trim()).filter(Boolean);
  lines.forEach(line => {
    if (/model|型番|品番/i.test(line)) {
      const compact = line.replace(/model|型番|品番|[:：]/ig, '').trim();
      if (compact.length >= 3) candidates.unshift(compact);
    }
  });
  return [...new Set(candidates)].slice(0, 16);
}
function sendOCRToResearch() {
  const maker = $('ocrApplyManufacturer')?.value.trim() || '';
  const name = $('ocrApplyName')?.value.trim() || '';
  if (!maker && !name) return alert('メーカー候補か型番/機材名候補を入れてください。');
  const target = $('ocrAssetSelect')?.value || currentAssetId;
  currentResearchId = target === '__new__' ? (db.equipment[0]?.id || '') : target;
  showView('research');
  if ($('researchAssetSelect')) $('researchAssetSelect').value = currentResearchId;
  $('researchQuery').value = `${maker} ${name}`.trim();
  renderSearchLinks();
}
function applyOCRToAsset() {
  const id = $('ocrAssetSelect')?.value;
  const maker = $('ocrApplyManufacturer')?.value.trim();
  const name = $('ocrApplyName')?.value.trim();
  const serial = $('ocrApplySerial')?.value.trim();

  if (id === '__new__') {
    if (!maker && !name && !serial) return alert('新規追加する内容がありません。OCR候補を選ぶか手入力してください。');
    const a = makeAssetFromOCR();
    db.equipment.push(a);
    currentAssetId = a.id;
    currentResearchId = a.id;
    save(); renderAll(); generateChecklist();
    alert(`OCR候補から新規機材を追加しました。管理ID：${a.id}`);
    return;
  }

  const a = getAsset(id); if (!a) return alert('反映先の機材がありません。');
  if (maker) a.manufacturer = maker;
  if (name) a.name = name;
  if (serial) a.serial = serial;
  currentAssetId = a.id;
  currentResearchId = a.id;
  save(); renderAll(); generateChecklist();
  alert('OCR候補を機材マスターへ反映しました。');
}

function bindSets() {
  $('setEditSelect').onchange = () => { currentSetName = $('setEditSelect').value; fillSetForm(); };
  $('newSetBtn').onclick = () => { currentSetName = ''; fillSetForm(null); };
  $('saveSetBtn').onclick = saveSet;
  $('deleteSetBtn').onclick = deleteSet;
  $('setListViewBtn').onclick = () => { setViewMode = 'list'; localStorage.setItem('equipment-manager-set-view', setViewMode); fillSetForm(db.sets.find(s => s.name === currentSetName) || null); renderSetCards(); };
  $('setPhotoViewBtn').onclick = () => { setViewMode = 'photo'; localStorage.setItem('equipment-manager-set-view', setViewMode); fillSetForm(db.sets.find(s => s.name === currentSetName) || null); renderSetCards(); };
}
function renderSetEditor() {
  if (!db.sets.some(s => s.name === currentSetName)) currentSetName = db.sets[0]?.name || '';
  $('setEditSelect').innerHTML = db.sets.map(s => `<option value="${esc(s.name)}" ${s.name === currentSetName ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  fillSetForm(db.sets.find(s => s.name === currentSetName) || null);
}
function fillSetForm(s) {
  if (!s) s = { name: '', description: '', equipmentIds: [] };
  $('setName').value = s.name || '';
  $('setDescription').value = s.description || '';
  $('setListViewBtn')?.classList.toggle('active', setViewMode === 'list');
  $('setPhotoViewBtn')?.classList.toggle('active', setViewMode === 'photo');
  const assets = [...db.equipment].sort((a, b) => (a.category || '').localeCompare(b.category || '', 'ja') || (a.name || '').localeCompare(b.name || '', 'ja'));
  if (setViewMode === 'photo') {
    $('setAssetChecks').className = 'set-photo-grid tall';
    $('setAssetChecks').innerHTML = assets.map(a => `<label class="set-photo-check">
      <input type="checkbox" value="${esc(a.id)}" ${s.equipmentIds.includes(a.id) ? 'checked' : ''}>
      <img src="${esc(a.imageUrl || 'https://placehold.co/320x200/0f172a/ffffff?text=NO+IMAGE')}" alt="">
      <span><b>${esc(a.name)}</b><small>${esc(a.id)} / ${esc(a.manufacturer || 'メーカー未入力')} / ${esc(a.category)}</small></span>
    </label>`).join('') || '<p class="hint">機材がありません。</p>';
  } else {
    $('setAssetChecks').className = 'check-grid tall';
    $('setAssetChecks').innerHTML = assets.map(a => `<label class="check-pill"><input type="checkbox" value="${esc(a.id)}" ${s.equipmentIds.includes(a.id) ? 'checked' : ''}><span>${esc(a.category)}｜${esc(a.manufacturer ? a.manufacturer + ' / ' : '')}${esc(a.name)} <small>${esc(a.id)}</small></span></label>`).join('') || '<p class="hint">機材がありません。</p>';
  }
}
function saveSet() {
  const oldName = currentSetName; const s = { name: $('setName').value.trim(), description: $('setDescription').value.trim(), equipmentIds: [...$('setAssetChecks').querySelectorAll('input:checked')].map(i => i.value) };
  if (!s.name) return alert('セット名は必須です。');
  const idx = db.sets.findIndex(x => x.name === oldName || x.name === s.name); if (idx >= 0) db.sets[idx] = s; else db.sets.push(s);
  if (oldName && oldName !== s.name) db.project.selectedSets = db.project.selectedSets.map(n => n === oldName ? s.name : n);
  currentSetName = s.name; save(); renderAll(); generateChecklist();
}
function deleteSet() {
  if (!currentSetName || !confirm('このセットを削除しますか？')) return;
  db.sets = db.sets.filter(s => s.name !== currentSetName); db.project.selectedSets = db.project.selectedSets.filter(n => n !== currentSetName);
  currentSetName = db.sets[0]?.name || ''; save(); renderAll(); generateChecklist();
}
function renderSetCards() {
  $('setCards').innerHTML = db.sets.map(s => {
    const assets = s.equipmentIds.map(getAsset).filter(Boolean);
    const preview = setViewMode === 'photo'
      ? `<div class="set-preview-photos">${assets.slice(0, 6).map(a => `<img src="${esc(a.imageUrl || 'https://placehold.co/120x80/0f172a/ffffff?text=NO+IMAGE')}" alt="${esc(a.name)}">`).join('')}</div>`
      : `<small>${assets.map(a => `${a.name}（${a.id}）`).join(' / ') || '機材未登録'}</small>`;
    return `<article class="list-card" data-set-card="${esc(s.name)}"><b>${esc(s.name)}</b><p>${esc(s.description || '')}</p><span class="chip">${assets.length} 件</span>${preview}</article>`;
  }).join('') || '<p class="hint">セットがありません。</p>';
  document.querySelectorAll('[data-set-card]').forEach(card => card.onclick = () => { currentSetName = card.dataset.setCard; $('setEditSelect').value = currentSetName; fillSetForm(db.sets.find(s => s.name === currentSetName)); });
}

function bindRental() {
  ['quoteCustomer', 'quoteSubject', 'quoteIssueDate', 'estimateDays', 'quoteMemo', 'quoteCompanyName', 'quoteCompanyTel', 'quoteCompanyEmail', 'quoteCompanyAddress', 'quotePaymentInfo', 'quoteValidUntil'].forEach(id => {
    const el = $(id); if (!el) return;
    el.oninput = () => { updateRentalQuoteFromForm(); save(); renderRental(); };
  });
  $('rentalSearch').oninput = renderRental;
  $('selectVisibleRentalBtn').onclick = () => {
    visibleRentalAssets().forEach(a => selectRentalAsset(a.id, true));
    save(); renderRental();
  };
  $('clearRentalSelectionBtn').onclick = () => {
    db.rentalQuote.selectedIds = [];
    save(); renderRental();
  };
  $('printRentalListBtn').onclick = () => printMode('rental-list');
  $('printEstimateBtn').onclick = () => {
    if (!db.rentalQuote.selectedIds.length) return alert('見積書に入れる機材をチェックしてください。');
    printMode('estimate');
  };
}
function updateRentalQuoteFromForm() {
  db.rentalQuote.customer = $('quoteCustomer').value.trim();
  db.rentalQuote.subject = $('quoteSubject').value.trim();
  db.rentalQuote.issueDate = $('quoteIssueDate').value || today();
  db.rentalQuote.days = Math.max(1, Number($('estimateDays').value || 1));
  db.rentalQuote.memo = $('quoteMemo').value.trim();
  db.rentalQuote.companyName = $('quoteCompanyName')?.value.trim() || '';
  db.rentalQuote.companyTel = $('quoteCompanyTel')?.value.trim() || '';
  db.rentalQuote.companyEmail = $('quoteCompanyEmail')?.value.trim() || '';
  db.rentalQuote.companyAddress = $('quoteCompanyAddress')?.value.trim() || '';
  db.rentalQuote.paymentInfo = $('quotePaymentInfo')?.value.trim() || '';
  db.rentalQuote.validUntil = $('quoteValidUntil')?.value.trim() || '';
}
function hydrateRentalForm() {
  if (!$('quoteCustomer')) return;
  $('quoteCustomer').value = db.rentalQuote.customer || '';
  $('quoteSubject').value = db.rentalQuote.subject || '';
  $('quoteIssueDate').value = db.rentalQuote.issueDate || today();
  $('estimateDays').value = db.rentalQuote.days || 1;
  $('quoteMemo').value = db.rentalQuote.memo || '';
  if ($('quoteCompanyName')) $('quoteCompanyName').value = db.rentalQuote.companyName || '';
  if ($('quoteCompanyTel')) $('quoteCompanyTel').value = db.rentalQuote.companyTel || '';
  if ($('quoteCompanyEmail')) $('quoteCompanyEmail').value = db.rentalQuote.companyEmail || '';
  if ($('quoteCompanyAddress')) $('quoteCompanyAddress').value = db.rentalQuote.companyAddress || '';
  if ($('quotePaymentInfo')) $('quotePaymentInfo').value = db.rentalQuote.paymentInfo || '';
  if ($('quoteValidUntil')) $('quoteValidUntil').value = db.rentalQuote.validUntil || '';
}
function visibleRentalAssets() {
  const q = ($('rentalSearch')?.value || '').toLowerCase();
  return db.equipment
    .filter(a => !a.consumable && assetSearchText(a).includes(q))
    .sort((a, b) => (categoryRank(a.category) - categoryRank(b.category)) || (a.name || '').localeCompare(b.name || '', 'ja'));
}
function masterRentalUnitPrice(id) {
  return Number(getAsset(id)?.rentalDay || 0);
}
function customRentalUnitPrice(id) {
  const v = db.rentalQuote.unitPrices?.[id];
  return v === undefined ? masterRentalUnitPrice(id) : Number(v || 0);
}
function useCustomPrice(id) {
  return Boolean(db.rentalQuote.overridePrices?.[id]);
}
function estimateUnitPrice(id) {
  return useCustomPrice(id) ? customRentalUnitPrice(id) : masterRentalUnitPrice(id);
}
function discountAmount(id) {
  const normal = masterRentalUnitPrice(id);
  const estimate = estimateUnitPrice(id);
  return Math.max(0, normal - estimate);
}
function rentalQuoteQty(id) {
  return Math.max(1, Number(db.rentalQuote.quoteQuantities?.[id] ?? 1));
}
function selectRentalAsset(id, checked) {
  const set = new Set(db.rentalQuote.selectedIds || []);
  checked ? set.add(id) : set.delete(id);
  db.rentalQuote.selectedIds = [...set];
  if (db.rentalQuote.unitPrices[id] === undefined) db.rentalQuote.unitPrices[id] = Number(getAsset(id)?.rentalDay || 0);
  if (db.rentalQuote.quoteQuantities[id] === undefined) db.rentalQuote.quoteQuantities[id] = 1;
  if (db.rentalQuote.overridePrices[id] === undefined) db.rentalQuote.overridePrices[id] = false;
}
function renderRental() {
  if (!$('estimateBox')) return;
  hydrateRentalForm();
  const days = Math.max(1, Number(db.rentalQuote.days || 1));
  const list = visibleRentalAssets();
  const selected = db.rentalQuote.selectedIds.map(getAsset).filter(Boolean);
  const total = selected.reduce((sum, a) => sum + estimateUnitPrice(a.id) * rentalQuoteQty(a.id) * days, 0);
  const discountTotal = selected.reduce((sum, a) => sum + discountAmount(a.id) * rentalQuoteQty(a.id) * days, 0);

  $('estimateBox').innerHTML = `<div class="summary"><div class="stat"><b>${list.length}</b><span>表示中</span></div><div class="stat"><b>${selected.length}</b><span>見積対象</span></div><div class="stat"><b>${days}</b><span>日数</span></div><div class="stat"><b>${yen(total)}</b><span>見積合計</span></div><div class="stat"><b>${yen(discountTotal)}</b><span>お値引き額</span></div></div>
  <div class="table-wrap"><table class="dense rental-edit-table"><thead><tr><th>選択</th><th>ID</th><th>メーカー</th><th>機材</th><th>カテゴリ</th><th>数量</th><th>レンタル単価</th><th>手入力単価</th><th>手入力をPDF反映</th><th>${days}日合計</th></tr></thead><tbody>${list.map(a => {
    const checked = db.rentalQuote.selectedIds.includes(a.id);
    const qty = rentalQuoteQty(a.id);
    const master = masterRentalUnitPrice(a.id);
    const custom = customRentalUnitPrice(a.id);
    const useCustom = useCustomPrice(a.id);
    const unit = estimateUnitPrice(a.id);
    return `<tr><td><input type="checkbox" data-rental-select="${esc(a.id)}" ${checked ? 'checked' : ''}></td><td>${esc(a.id)}</td><td>${esc(a.manufacturer)}</td><td>${esc(a.name)}</td><td>${esc(a.category)}</td><td><input type="number" min="1" value="${qty}" data-rental-qty="${esc(a.id)}"></td><td><b>${yen(master)}</b></td><td><input type="number" min="0" value="${custom}" data-rental-price="${esc(a.id)}"></td><td><input type="checkbox" data-rental-override="${esc(a.id)}" ${useCustom ? 'checked' : ''}></td><td><b>${yen(unit * qty * days)}</b></td></tr>`;
  }).join('') || '<tr><td colspan="10">機材がありません。</td></tr>'}</tbody></table></div>`;

  document.querySelectorAll('[data-rental-select]').forEach(input => input.onchange = () => { selectRentalAsset(input.dataset.rentalSelect, input.checked); save(); renderRental(); });
  document.querySelectorAll('[data-rental-price]').forEach(input => input.oninput = () => { db.rentalQuote.unitPrices[input.dataset.rentalPrice] = Math.max(0, Number(input.value || 0)); save(); renderRentalPrints(); });
  document.querySelectorAll('[data-rental-override]').forEach(input => input.onchange = () => { db.rentalQuote.overridePrices[input.dataset.rentalOverride] = input.checked; save(); renderRental(); });
  document.querySelectorAll('[data-rental-qty]').forEach(input => input.oninput = () => { db.rentalQuote.quoteQuantities[input.dataset.rentalQty] = Math.max(1, Number(input.value || 1)); save(); renderRentalPrints(); });
  renderRentalPrints();
}
function renderRentalPrints() {
  const days = Math.max(1, Number(db.rentalQuote.days || 1));
  const list = visibleRentalAssets();
  const selected = db.rentalQuote.selectedIds.map(getAsset).filter(Boolean);
  const quoteTotal = selected.reduce((sum, a) => sum + estimateUnitPrice(a.id) * rentalQuoteQty(a.id) * days, 0);
  const normalTotal = selected.reduce((sum, a) => sum + masterRentalUnitPrice(a.id) * rentalQuoteQty(a.id) * days, 0);
  const discountTotal = Math.max(0, normalTotal - quoteTotal);
  const meta = `発行日：${esc(db.rentalQuote.issueDate || today())}<br>宛先：${esc(db.rentalQuote.customer || '-')}<br>件名：${esc(db.rentalQuote.subject || '-')}<br>レンタル日数：${esc(days)}日`;
  const issuer = `<div class="issuer-box"><b>${esc(db.rentalQuote.companyName || '発行会社名')}</b><br>${esc(db.rentalQuote.companyAddress || '').replace(/\n/g, '<br>')}${db.rentalQuote.companyTel ? `<br>TEL：${esc(db.rentalQuote.companyTel)}` : ''}${db.rentalQuote.companyEmail ? `<br>MAIL：${esc(db.rentalQuote.companyEmail)}` : ''}${db.rentalQuote.validUntil ? `<br>見積有効期限：${esc(db.rentalQuote.validUntil)}` : ''}</div>`;
  const payment = db.rentalQuote.paymentInfo ? `<div class="quote-memo"><b>支払条件・振込先</b><br>${esc(db.rentalQuote.paymentInfo).replace(/\n/g, '<br>')}</div>` : '';
  $('rentalListPrint').innerHTML = `<div class="print-title"><div><p class="eyebrow dark">Rental Price List</p><h2>レンタル価格表</h2></div><div class="print-meta">${meta}</div></div><div class="table-wrap"><table class="dense"><thead><tr><th>選択</th><th>ID</th><th>メーカー</th><th>機材</th><th>カテゴリ</th><th>数量</th><th>レンタル単価</th><th>手入力単価</th><th>手入力反映</th><th>${days}日合計</th></tr></thead><tbody>${list.map(a => { const master = masterRentalUnitPrice(a.id); const custom = customRentalUnitPrice(a.id); const qty = rentalQuoteQty(a.id); const unit = estimateUnitPrice(a.id); return `<tr><td>${db.rentalQuote.selectedIds.includes(a.id) ? '☑' : '☐'}</td><td>${esc(a.id)}</td><td>${esc(a.manufacturer)}</td><td>${esc(a.name)}</td><td>${esc(a.category)}</td><td>${esc(qty)}</td><td>${yen(master)}</td><td>${useCustomPrice(a.id) ? yen(custom) : '-'}</td><td>${useCustomPrice(a.id) ? '反映' : '-'}</td><td>${yen(unit * qty * days)}</td></tr>`; }).join('')}</tbody></table></div>`;
  $('estimatePrint').innerHTML = `<div class="print-title"><div><p class="eyebrow dark">Estimate</p><h2>レンタル機材 御見積書</h2></div><div class="print-meta">${meta}</div></div>${issuer}<div class="summary estimate-summary"><div class="stat"><b>${days}</b><span>日数</span></div><div class="stat"><b>${yen(quoteTotal)}</b><span>御見積金額</span></div>${discountTotal > 0 ? `<div class="stat discount"><b>${yen(discountTotal)}</b><span>お値引き額</span></div>` : ''}</div><div class="table-wrap"><table class="dense"><thead><tr><th>ID</th><th>メーカー</th><th>機材</th><th>カテゴリ</th><th>数量</th><th>単価/日</th><th>日数</th><th>金額</th>${discountTotal > 0 ? '<th>お値引き</th>' : ''}</tr></thead><tbody>${selected.map(a => { const master = masterRentalUnitPrice(a.id); const custom = customRentalUnitPrice(a.id); const unit = estimateUnitPrice(a.id); const qty = rentalQuoteQty(a.id); const discount = discountAmount(a.id) * qty * days; return `<tr><td>${esc(a.id)}</td><td>${esc(a.manufacturer)}</td><td>${esc(a.name)}</td><td>${esc(a.category)}</td><td>${esc(qty)}</td><td>${yen(unit)}</td><td>${days}</td><td><b>${yen(unit * qty * days)}</b></td>${discountTotal > 0 ? `<td>${discount > 0 ? yen(discount) : '-'}</td>` : ''}</tr>`; }).join('') || '<tr><td colspan="9">選択された機材がありません。</td></tr>'}</tbody><tfoot><tr><th colspan="${discountTotal > 0 ? 7 : 7}">合計</th><th>${yen(quoteTotal)}</th>${discountTotal > 0 ? `<th>${yen(discountTotal)}</th>` : ''}</tr></tfoot></table></div>${db.rentalQuote.memo ? `<div class="quote-memo"><b>備考</b><br>${esc(db.rentalQuote.memo).replace(/\n/g, '<br>')}</div>` : ''}${payment}<div class="sign-area"><span>発行：</span><span>承認：</span></div>`;
}

function printMode(mode) {
  renderRentalPrints();
  const originalTitle = document.title;
  document.title = ' ';
  document.body.classList.remove('print-rental-list', 'print-estimate');
  document.body.classList.add(mode === 'estimate' ? 'print-estimate' : 'print-rental-list');
  window.print();
  setTimeout(() => { document.body.classList.remove('print-rental-list', 'print-estimate'); document.title = originalTitle; }, 500);
}

function bindCategoryManager() {
  const addBtn = $('addCategoryBtn');
  if (!addBtn) return;
  addBtn.onclick = addCategory;
  $('categoryNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });
}
function renderCategoryManager() {
  const list = $('categoryManagerList');
  if (!list) return;
  const cats = uniqueCategories(db);
  const counts = Object.fromEntries(cats.map(c => [c, db.equipment.filter(a => a.category === c).length]));
  list.innerHTML = cats.map((c, i) => `
    <div class="category-manage-row" data-cat="${esc(c)}">
      <div class="category-manage-main">
        <input class="category-name-edit" data-category-name="${esc(c)}" value="${esc(c)}">
        <span class="chip">${counts[c] || 0} 件</span>
      </div>
      <div class="category-actions">
        <button class="btn small" data-category-save="${esc(c)}">名称変更</button>
        <button class="btn small" data-category-up="${esc(c)}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn small" data-category-down="${esc(c)}" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn small danger ghost" data-category-delete="${esc(c)}">削除</button>
      </div>
    </div>
  `).join('') || '<p class="hint">カテゴリがまだありません。</p>';
  document.querySelectorAll('[data-category-save]').forEach(btn => btn.onclick = () => renameCategory(btn.dataset.categorySave));
  document.querySelectorAll('[data-category-up]').forEach(btn => btn.onclick = () => moveCategory(btn.dataset.categoryUp, -1));
  document.querySelectorAll('[data-category-down]').forEach(btn => btn.onclick = () => moveCategory(btn.dataset.categoryDown, 1));
  document.querySelectorAll('[data-category-delete]').forEach(btn => btn.onclick = () => deleteCategory(btn.dataset.categoryDelete));
}
function addCategory() {
  const input = $('categoryNameInput');
  const name = (input.value || '').trim();
  if (!name) return alert('カテゴリ名を入力してください。');
  if (uniqueCategories(db).includes(name)) return alert('同じカテゴリがすでにあります。');
  db.categories = [...uniqueCategories(db), name];
  input.value = '';
  save(); renderAll(); generateChecklist();
}
function renameCategory(oldName) {
  const row = document.querySelector(`[data-cat="${CSS.escape(oldName)}"]`);
  const input = row?.querySelector('[data-category-name]');
  const newName = (input?.value || '').trim();
  if (!newName) return alert('新しいカテゴリ名を入力してください。');
  if (newName !== oldName && uniqueCategories(db).includes(newName)) return alert('同じカテゴリ名がすでにあります。');
  db.categories = uniqueCategories(db).map(c => c === oldName ? newName : c);
  db.equipment = db.equipment.map(a => a.category === oldName ? { ...a, category: newName } : a);
  save(); renderAll(); generateChecklist();
}
function moveCategory(name, dir) {
  const cats = uniqueCategories(db);
  const i = cats.indexOf(name);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  db.categories = cats;
  save(); renderAll(); generateChecklist();
}
function deleteCategory(name) {
  const used = db.equipment.filter(a => a.category === name).length;
  if (used > 0) {
    const choices = uniqueCategories(db).filter(c => c !== name);
    const replacement = prompt(`${name} は ${used} 件の機材で使用中です。移行先カテゴリ名を入力してください。\n既存カテゴリ例：${choices.join(' / ')}\n空欄の場合は「その他」に移行します。`, choices[0] || 'その他');
    if (replacement === null) return;
    const dest = (replacement || 'その他').trim() || 'その他';
    db.equipment = db.equipment.map(a => a.category === name ? { ...a, category: dest } : a);
    db.categories = uniqueCategories({ ...db, categories: db.categories.filter(c => c !== name), equipment: db.equipment });
    if (!db.categories.includes(dest)) db.categories.push(dest);
  } else {
    if (!confirm(`${name} を削除しますか？`)) return;
    db.categories = uniqueCategories(db).filter(c => c !== name);
  }
  save(); renderAll(); generateChecklist();
}

function bindTools() {
  $('applyCsvBtn').onclick = applyCsv;
  bindCategoryManager();
  $('resetAllBtn').onclick = () => { if (confirm('すべて初期サンプルに戻しますか？')) { localStorage.removeItem(STORAGE_KEY); db = normalizeData(defaultData); currentAssetId = db.equipment[0]?.id || ''; currentSetName = db.sets[0]?.name || ''; currentResearchId = currentAssetId; hydrateProjectForm(); renderAll(); generateChecklist(); } };
}
function exportJson() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `equipment-manager-lite-v20-backup-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function importJson(e) {
  const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
  reader.onload = () => { try { db = normalizeData(JSON.parse(reader.result)); save(); currentAssetId = db.equipment[0]?.id || ''; currentSetName = db.sets[0]?.name || ''; currentResearchId = currentAssetId; hydrateProjectForm(); renderAll(); generateChecklist(); alert('読み込みました'); } catch { alert('JSONを読み込めませんでした。'); } };
  reader.readAsText(file);
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i], next = text[i + 1]; if (ch === '"' && inQuotes && next === '"') { cell += '"'; i++; } else if (ch === '"') inQuotes = !inQuotes; else if (ch === ',' && !inQuotes) { row.push(cell); cell = ''; } else if ((ch === '\n' || ch === '\r') && !inQuotes) { if (cell || row.length) { row.push(cell); rows.push(row); row = []; cell = ''; } if (ch === '\r' && next === '\n') i++; } else cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); } return rows;
}
function applyCsv() {
  const text = $('csvImportText').value.trim(); if (!text) return; const rows = parseCsv(text); const headers = rows.shift().map(h => h.trim());
  rows.forEach(cols => {
    const r = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ''])); const id = r.id || r.ID || r['管理ID']; if (!id) return;
    const a = { id, manufacturer: r.manufacturer || r['メーカー'] || r['メーカー名'] || '', name: r.name || r['機材名'] || '', category: r.category || r['カテゴリ'] || 'その他', quantity: Number(r.quantity || r['数量'] || 1), status: r.status || r['状態'] || 'OK', newPrice: Number(r.newPrice || r['新品価格'] || 0), rentalDay: Number(r.rentalDay || r['レンタル日額'] || 0), manualUrl: r.manualUrl || r['取説URL'] || '', imageUrl: r.imageUrl || r['画像URL'] || '', productUrl: r.productUrl || r['商品URL'] || '', serial: r.serial || r['シリアル'] || '', notes: r.notes || r['備考'] || '', consumable: String(r.consumable || r['消耗品']).toLowerCase() === 'true' };
    const idx = db.equipment.findIndex(x => x.id === id); if (idx >= 0) db.equipment[idx] = a; else db.equipment.push(a);
  });
  save(); renderAll(); generateChecklist(); alert('CSVを反映しました。');
}

init();
initCloudSync(window.EquipmentManagerApp);
