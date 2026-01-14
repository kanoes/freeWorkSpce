// ===== TradeDiary App =====

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return {
    full: d.toISOString().split('T')[0],
    day: d.getDate(),
    month: d.toLocaleDateString('zh-CN', { month: 'short' }),
    year: d.getFullYear(),
    weekday: d.toLocaleDateString('zh-CN', { weekday: 'short' })
  };
};

const formatMoney = (amount) => {
  const num = Number(amount) || 0;
  const prefix = num >= 0 ? '+' : '';
  return `${prefix}¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const formatMoneyShort = (amount) => {
  const num = Number(amount) || 0;
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const generateId = () => crypto.randomUUID();

const todayStr = () => new Date().toISOString().split('T')[0];

// ===== IndexedDB =====
const DB_NAME = 'tradediary_db';
const DB_VERSION = 1;
const STORE_NAME = 'days';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: true });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllDays() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('date');
    const request = index.openCursor(null, 'prev');
    const results = [];
    
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function getDayByDate(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('date');
    const request = index.get(dateStr);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveDay(day) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(day);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDay(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllDays() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===== App State =====
let DAYS = [];
let currentFilter = 'all';
let profitChart = null;

// ===== Chart =====
function initChart() {
  const ctx = $('#profitChart').getContext('2d');
  
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
  
  profitChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '累计收益',
        data: [],
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#818cf8',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#f9fafb' : '#0f172a',
          bodyColor: isDark ? '#f9fafb' : '#0f172a',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (item) => `累计: ${formatMoneyShort(item.raw)}`
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: textColor,
            font: { size: 11 },
            maxRotation: 0
          }
        },
        y: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: (value) => `¥${value}`
          }
        }
      }
    }
  });
}

function updateChart(range = 'week') {
  if (!profitChart) return;
  
  // Filter open days and sort by date
  const openDays = DAYS
    .filter(d => d.status === 'open')
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  let filteredDays = openDays;
  const now = new Date();
  
  if (range === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filteredDays = openDays.filter(d => new Date(d.date) >= weekAgo);
  } else if (range === 'month') {
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    filteredDays = openDays.filter(d => new Date(d.date) >= monthAgo);
  }
  
  // Calculate cumulative profit
  let cumulative = 0;
  const labels = [];
  const data = [];
  
  filteredDays.forEach(day => {
    const profit = day.trades?.reduce((sum, t) => sum + (Number(t.profit) || 0), 0) || 0;
    cumulative += profit;
    
    const dateInfo = formatDate(day.date);
    labels.push(`${dateInfo.month}${dateInfo.day}日`);
    data.push(cumulative);
  });
  
  profitChart.data.labels = labels;
  profitChart.data.datasets[0].data = data;
  
  // Update gradient based on profit
  const ctx = $('#profitChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  
  if (cumulative >= 0) {
    gradient.addColorStop(0, 'rgba(52, 211, 153, 0.3)');
    gradient.addColorStop(1, 'rgba(52, 211, 153, 0)');
    profitChart.data.datasets[0].borderColor = '#34d399';
  } else {
    gradient.addColorStop(0, 'rgba(248, 113, 113, 0.3)');
    gradient.addColorStop(1, 'rgba(248, 113, 113, 0)');
    profitChart.data.datasets[0].borderColor = '#f87171';
  }
  profitChart.data.datasets[0].backgroundColor = gradient;
  
  profitChart.update();
}

// ===== Summary Stats =====
function updateSummary() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Filter this month's open days
  const monthDays = DAYS.filter(d => {
    const date = new Date(d.date);
    return date.getMonth() === currentMonth && 
           date.getFullYear() === currentYear && 
           d.status === 'open';
  });
  
  // Calculate month profit
  let monthProfit = 0;
  let winDays = 0;
  
  monthDays.forEach(day => {
    const dayProfit = day.trades?.reduce((sum, t) => sum + (Number(t.profit) || 0), 0) || 0;
    monthProfit += dayProfit;
    if (dayProfit > 0) winDays++;
  });
  
  const tradeDays = monthDays.length;
  const winRate = tradeDays > 0 ? Math.round((winDays / tradeDays) * 100) : 0;
  
  // Update UI
  const profitEl = $('#monthProfit');
  profitEl.textContent = formatMoneyShort(monthProfit);
  profitEl.className = 'summary-value';
  
  $('#tradeDays').textContent = `${tradeDays}天`;
  $('#winRate').textContent = `${winRate}%`;
}

// ===== Records List =====
function updateMonthFilter() {
  const select = $('#monthFilter');
  const months = new Set();
  
  DAYS.forEach(d => {
    const date = new Date(d.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.add(key);
  });
  
  const sortedMonths = Array.from(months).sort().reverse();
  
  select.innerHTML = '<option value="all">全部</option>';
  sortedMonths.forEach(m => {
    const [year, month] = m.split('-');
    const option = document.createElement('option');
    option.value = m;
    option.textContent = `${year}年${parseInt(month)}月`;
    select.appendChild(option);
  });
  
  select.value = currentFilter;
}

function renderRecords() {
  const list = $('#recordsList');
  const empty = $('#emptyState');
  
  let filteredDays = DAYS;
  
  if (currentFilter !== 'all') {
    filteredDays = DAYS.filter(d => {
      const date = new Date(d.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return key === currentFilter;
    });
  }
  
  if (filteredDays.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    list.appendChild(empty);
    return;
  }
  
  empty.style.display = 'none';
  
  list.innerHTML = filteredDays.map(day => {
    const dateInfo = formatDate(day.date);
    let statusClass = day.status;
    let statusText = '';
    let statusIcon = '';
    
    switch (day.status) {
      case 'open':
        statusText = '开盘';
        statusIcon = '📈';
        break;
      case 'holiday':
        statusText = '祝日';
        statusIcon = '🎌';
        break;
      case 'closed':
        statusText = '休日';
        statusIcon = '🌙';
        break;
    }
    
    let tradesInfo = '';
    let profitHtml = '';
    
    if (day.status === 'open' && day.trades?.length > 0) {
      const symbols = day.trades.map(t => t.symbol).filter(Boolean).join(', ');
      tradesInfo = symbols || '无交易';
      
      const totalProfit = day.trades.reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
      const profitClass = totalProfit > 0 ? 'positive' : (totalProfit < 0 ? 'negative' : 'zero');
      profitHtml = `<div class="record-profit ${profitClass}">${formatMoney(totalProfit)}</div>`;
    } else if (day.status === 'open') {
      tradesInfo = '无交易记录';
      profitHtml = `<div class="record-profit zero">¥0</div>`;
    } else {
      tradesInfo = statusText;
    }
    
    return `
      <div class="record-item" data-id="${day.id}">
        <div class="record-date">
          <div class="day">${dateInfo.day}</div>
          <div class="month">${dateInfo.month}</div>
        </div>
        <div class="record-info">
          <div class="record-status ${statusClass}">
            <span>${statusIcon}</span>
            <span>${statusText}</span>
          </div>
          <div class="record-trades">${tradesInfo}</div>
        </div>
        ${profitHtml}
      </div>
    `;
  }).join('');
  
  // Bind click events
  $$('.record-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const day = DAYS.find(d => d.id === id);
      if (day) openDaySheet('edit', day);
    });
  });
}

// ===== Day Sheet (Add/Edit) =====
let currentEditDay = null;
let tradeEntries = [];

function openDaySheet(mode, day = null) {
  const sheet = $('#daySheet');
  const title = $('#sheetTitle');
  const deleteBtn = $('#btnDeleteDay');
  
  currentEditDay = day;
  tradeEntries = [];
  
  if (mode === 'add') {
    title.textContent = '添加记录';
    deleteBtn.hidden = true;
    $('#fDayId').value = '';
    $('#fDate').value = todayStr();
    $('#fStatus').value = '';
    setStatusSelection('');
    $('#tradesSection').hidden = true;
    renderTradeEntries();
  } else {
    title.textContent = '编辑记录';
    deleteBtn.hidden = false;
    $('#fDayId').value = day.id;
    $('#fDate').value = day.date;
    $('#fStatus').value = day.status;
    setStatusSelection(day.status);
    
    if (day.status === 'open') {
      $('#tradesSection').hidden = false;
      tradeEntries = day.trades?.map(t => ({ ...t })) || [];
      if (tradeEntries.length === 0) {
        tradeEntries.push({ symbol: '', profit: '' });
      }
    } else {
      $('#tradesSection').hidden = true;
    }
    renderTradeEntries();
  }
  
  sheet.setAttribute('aria-hidden', 'false');
}

function closeDaySheet() {
  $('#daySheet').setAttribute('aria-hidden', 'true');
  currentEditDay = null;
  tradeEntries = [];
}

function setStatusSelection(status) {
  $$('.status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  $('#fStatus').value = status;
  
  if (status === 'open') {
    $('#tradesSection').hidden = false;
    if (tradeEntries.length === 0) {
      tradeEntries.push({ symbol: '', profit: '' });
    }
    renderTradeEntries();
  } else {
    $('#tradesSection').hidden = true;
  }
}

function renderTradeEntries() {
  const container = $('#tradesListForm');
  
  container.innerHTML = tradeEntries.map((trade, index) => `
    <div class="trade-entry" data-index="${index}">
      <input type="text" 
             class="form-input symbol-input" 
             placeholder="股票代码" 
             value="${trade.symbol || ''}"
             data-field="symbol" />
      <input type="number" 
             class="form-input profit-input" 
             placeholder="损益 (¥)" 
             value="${trade.profit || ''}"
             step="0.01"
             data-field="profit" />
      <button type="button" class="remove-trade-btn" ${tradeEntries.length <= 1 ? 'style="visibility:hidden"' : ''}>×</button>
    </div>
  `).join('');
  
  // Bind input events
  container.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const entry = e.target.closest('.trade-entry');
      const index = parseInt(entry.dataset.index);
      const field = e.target.dataset.field;
      tradeEntries[index][field] = e.target.value;
      updateDailyTotal();
    });
  });
  
  // Bind remove buttons
  container.querySelectorAll('.remove-trade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const entry = e.target.closest('.trade-entry');
      const index = parseInt(entry.dataset.index);
      tradeEntries.splice(index, 1);
      renderTradeEntries();
      updateDailyTotal();
    });
  });
  
  updateDailyTotal();
}

function updateDailyTotal() {
  const total = tradeEntries.reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
  const el = $('#dailyTotal');
  el.textContent = formatMoney(total);
  el.className = 'daily-total';
  if (total > 0) el.classList.add('positive');
  else if (total < 0) el.classList.add('negative');
}

// ===== Settings Sheet =====
function openSettings() {
  $('#settingsSheet').setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  $('#settingsSheet').setAttribute('aria-hidden', 'true');
}

// ===== Export/Import =====
function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    version: '2.0',
    days: DAYS
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tradediary-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const days = Array.isArray(data) ? data : (data.days || []);
    
    if (!Array.isArray(days)) {
      throw new Error('Invalid data format');
    }
    
    for (const day of days) {
      if (!day || !day.id) continue;
      await saveDay({
        id: day.id,
        date: day.date,
        status: day.status || 'open',
        trades: day.trades || [],
        updatedAt: new Date().toISOString()
      });
    }
    
    alert('导入成功！');
    closeSettings();
    await refresh();
  } catch (err) {
    alert('导入失败：' + (err.message || err));
  }
}

// ===== Refresh =====
async function refresh() {
  DAYS = await getAllDays();
  updateSummary();
  updateMonthFilter();
  renderRecords();
  updateChart($('.chart-tab.active')?.dataset.range || 'week');
}

// ===== Event Bindings =====
function bindEvents() {
  // Add day button
  $('#btnAddDay').addEventListener('click', () => openDaySheet('add'));
  
  // Sheet close buttons
  $('#btnCloseSheet').addEventListener('click', closeDaySheet);
  $('#btnCancelSheet').addEventListener('click', closeDaySheet);
  $('#daySheetBackdrop').addEventListener('click', closeDaySheet);
  
  // Status selection
  $$('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setStatusSelection(btn.dataset.status);
    });
  });
  
  // Add trade button
  $('#btnAddTrade').addEventListener('click', () => {
    tradeEntries.push({ symbol: '', profit: '' });
    renderTradeEntries();
  });
  
  // Form submit
  $('#dayForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = $('#fDayId').value || generateId();
    const date = $('#fDate').value;
    const status = $('#fStatus').value;
    
    if (!date) {
      alert('请选择日期');
      return;
    }
    
    if (!status) {
      alert('请选择市场状态');
      return;
    }
    
    // Check if date already exists (for new entries)
    if (!$('#fDayId').value) {
      const existing = await getDayByDate(date);
      if (existing) {
        alert('该日期已有记录，请编辑现有记录');
        return;
      }
    }
    
    const day = {
      id,
      date,
      status,
      trades: status === 'open' ? tradeEntries.filter(t => t.symbol || t.profit) : [],
      updatedAt: new Date().toISOString()
    };
    
    await saveDay(day);
    closeDaySheet();
    await refresh();
  });
  
  // Delete day
  $('#btnDeleteDay').addEventListener('click', async () => {
    if (!currentEditDay) return;
    
    if (confirm('确定要删除这条记录吗？')) {
      await deleteDay(currentEditDay.id);
      closeDaySheet();
      await refresh();
    }
  });
  
  // Month filter
  $('#monthFilter').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderRecords();
  });
  
  // Chart tabs
  $$('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateChart(tab.dataset.range);
    });
  });
  
  // Settings
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCloseSettings').addEventListener('click', closeSettings);
  $('#settingsBackdrop').addEventListener('click', closeSettings);
  
  // Export
  $('#btnExport').addEventListener('click', exportData);
  
  // Import
  $('#fileImport').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      importData(file);
      e.target.value = '';
    }
  });
  
  // Clear all
  $('#btnClearAll').addEventListener('click', async () => {
    if (confirm('确定要清空所有数据吗？此操作不可撤销！')) {
      await clearAllDays();
      closeSettings();
      await refresh();
    }
  });
  
  // Theme change listener
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (profitChart) {
      profitChart.destroy();
      initChart();
      updateChart($('.chart-tab.active')?.dataset.range || 'week');
    }
  });
}

// ===== Initialize =====
async function init() {
  initChart();
  bindEvents();
  await refresh();
}

// Start the app
init();
