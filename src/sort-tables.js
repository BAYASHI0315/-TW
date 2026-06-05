// Equipment Manager Lite v22 Sort Tables
// 各種テーブルのヘッダークリックで昇順/降順ソートできる機能を追加します。
// v20.1 / v20.2 / v21 / v21.1 に後付けできます。

const SORT_STATE = new WeakMap();

function normalizeSortText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[￥¥,]/g, '')
    .replace(/[▲▼↕]/g, '')
    .trim();
}

function getCellSortValue(row, index) {
  const cell = row.children[index];
  if (!cell) return '';

  const checkbox = cell.querySelector('input[type="checkbox"]');
  if (checkbox) return checkbox.checked ? '1' : '0';

  const input = cell.querySelector('input, textarea, select');
  if (input) return normalizeSortText(input.value || input.textContent || '');

  return normalizeSortText(cell.innerText || cell.textContent || '');
}

function parseSortNumber(value) {
  const text = normalizeSortText(value);
  if (!text) return null;
  const cleaned = text.replace(/[^\d.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function compareValues(a, b, direction) {
  const an = parseSortNumber(a);
  const bn = parseSortNumber(b);

  let result;
  if (an !== null && bn !== null) {
    result = an - bn;
  } else {
    result = String(a).localeCompare(String(b), 'ja', {
      numeric: true,
      sensitivity: 'base'
    });
  }

  return direction === 'asc' ? result : -result;
}

function isCategoryRow(row) {
  return row.classList.contains('category-row') ||
    row.classList.contains('category-header') ||
    (row.children.length === 1 && Number(row.children[0].getAttribute('colspan') || 0) > 1);
}

function sortRegularTable(table, columnIndex, direction) {
  const tbody = table.tBodies[0];
  if (!tbody) return;

  const rows = Array.from(tbody.rows);
  const dataRows = rows.filter(row => !isCategoryRow(row));

  dataRows.sort((ra, rb) => {
    const a = getCellSortValue(ra, columnIndex);
    const b = getCellSortValue(rb, columnIndex);
    return compareValues(a, b, direction);
  });

  dataRows.forEach(row => tbody.appendChild(row));
}

function buildCategoryGroups(rows) {
  const groups = [];
  let current = { header: null, rows: [] };

  rows.forEach(row => {
    if (isCategoryRow(row)) {
      if (current.header || current.rows.length) groups.push(current);
      current = { header: row, rows: [] };
    } else {
      current.rows.push(row);
    }
  });

  if (current.header || current.rows.length) groups.push(current);
  return groups;
}

function sortCategoryTable(table, columnIndex, direction) {
  const tbody = table.tBodies[0];
  if (!tbody) return;

  const rows = Array.from(tbody.rows);
  const groups = buildCategoryGroups(rows);
  const headerTexts = groups.map(g => normalizeSortText(g.header?.innerText || ''));
  const hasMeaningfulHeaders = headerTexts.some(Boolean);
  const sortGroupsByCategory = columnIndex <= 2 && hasMeaningfulHeaders;

  if (sortGroupsByCategory) {
    groups.sort((ga, gb) => compareValues(
      normalizeSortText(ga.header?.innerText || ''),
      normalizeSortText(gb.header?.innerText || ''),
      direction
    ));
  }

  groups.forEach(group => {
    group.rows.sort((ra, rb) => {
      const a = getCellSortValue(ra, columnIndex);
      const b = getCellSortValue(rb, columnIndex);
      return compareValues(a, b, direction);
    });
  });

  groups.forEach(group => {
    if (group.header) tbody.appendChild(group.header);
    group.rows.forEach(row => tbody.appendChild(row));
  });
}

function clearSortIndicators(table) {
  table.querySelectorAll('th[data-sortable="true"]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const base = th.dataset.sortBaseLabel || th.textContent.replace(/[▲▼↕]/g, '').trim();
    th.textContent = base + ' ↕';
  });
}

function sortTableByHeader(table, th, columnIndex) {
  const previous = SORT_STATE.get(table) || {};
  const direction = previous.columnIndex === columnIndex && previous.direction === 'asc' ? 'desc' : 'asc';

  SORT_STATE.set(table, { columnIndex, direction });
  clearSortIndicators(table);

  th.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
  th.textContent = `${th.dataset.sortBaseLabel} ${direction === 'asc' ? '▲' : '▼'}`;

  const tbody = table.tBodies[0];
  if (!tbody) return;

  const rows = Array.from(tbody.rows);
  if (rows.some(isCategoryRow)) {
    sortCategoryTable(table, columnIndex, direction);
  } else {
    sortRegularTable(table, columnIndex, direction);
  }
}

function getHeaderCellIndex(th) {
  const row = th.parentElement;
  if (!row) return 0;

  let index = 0;
  for (const cell of row.children) {
    if (cell === th) return index;
    index += Number(cell.getAttribute('colspan') || 1);
  }
  return th.cellIndex || 0;
}

function enhanceTable(table) {
  if (!table || table.dataset.v22SortEnhanced === 'true') return;
  const headerRow = table.tHead?.rows?.[0] || table.querySelector('thead tr');
  const tbody = table.tBodies?.[0];

  if (!headerRow || !tbody || tbody.rows.length === 0) return;

  const headers = Array.from(headerRow.cells);
  if (!headers.length) return;

  headers.forEach(th => {
    const label = normalizeSortText(th.textContent);
    if (!label) return;

    th.dataset.sortable = 'true';
    th.dataset.sortBaseLabel = label;
    th.textContent = label + ' ↕';
    th.title = 'クリックで並び替え';
    th.addEventListener('click', () => {
      sortTableByHeader(table, th, getHeaderCellIndex(th));
    });
  });

  table.dataset.v22SortEnhanced = 'true';
}

function installSortStyle() {
  if (document.getElementById('v22-sort-style')) return;
  const style = document.createElement('style');
  style.id = 'v22-sort-style';
  style.textContent = `
    th[data-sortable="true"] {
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      position: relative;
    }
    th[data-sortable="true"]:hover {
      background: rgba(96, 165, 250, .18) !important;
    }
    th.sort-asc,
    th.sort-desc {
      color: #dbeafe;
      background: rgba(59, 130, 246, .20) !important;
    }
    @media print {
      th[data-sortable="true"] {
        cursor: default;
      }
    }
  `;
  document.head.appendChild(style);
}

function enhanceAllTables() {
  installSortStyle();

  const tables = Array.from(document.querySelectorAll('table'));
  tables.forEach(table => {
    const headerCount = table.querySelectorAll('thead th').length;
    const rowCount = table.querySelectorAll('tbody tr').length;
    if (headerCount >= 2 && rowCount >= 1) enhanceTable(table);
  });
}

function scheduleEnhance() {
  clearTimeout(window.__v22SortTimer);
  window.__v22SortTimer = setTimeout(enhanceAllTables, 150);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceAllTables);
} else {
  enhanceAllTables();
}

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.body, { childList: true, subtree: true });

setTimeout(enhanceAllTables, 500);
setTimeout(enhanceAllTables, 1500);
