// ===== 甜饼工坊 App v3.0 =====
// 支持买卖交易记录、持仓管理、自动损益计算

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

// ===== Company Name Mapping =====
let companyMap = new Map(); // code -> { name, market }

async function loadCompanyData() {
  try {
    const response = await fetch('./companies_tse.json');
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.companies && Array.isArray(data.companies)) {
      data.companies.forEach(company => {
        companyMap.set(company.code.toUpperCase(), {
          name: company.name,
          market: company.market
        });
      });
      console.log(`Loaded ${companyMap.size} company records`);
    }
  } catch (err) {
    console.warn('Could not load company data:', err);
  }
}

function getCompanyName(code) {
  if (!code) return '';
  const company = companyMap.get(code.toUpperCase());
  return company ? company.name : code;
}

function getStockDisplayName(code) {
  if (!code) return '';
  const company = companyMap.get(code.toUpperCase());
  if (company) {
    return company.name;
  }
  return code;
}

// ===== IndexedDB =====
const DB_NAME = 'tradediary_db';
const DB_VERSION = 2; // Upgraded for new data structure
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
let monthlyChart = null;
let currentPage = 1;
const RECORDS_PER_PAGE = 7;

// Analysis page pagination
let holdingsPage = 1;
let stockRankingPage = 1;
const ITEMS_PER_PAGE = 5;

// Dividend settings
let dividendNumerator = 1;
let dividendDenominator = 3;

// Edit mode flag
let isEditMode = false;

// AI Assistant state
let openaiApiKey = localStorage.getItem('openai_api_key') || '';
let chatHistory = [];
let currentChatMode = null; // 'trade' or 'general'
let isAILoading = false;

// JSONBin 云同步（与对方共享数据）
let jsonbinApiKey = localStorage.getItem('jsonbin_api_key') || '';
let jsonbinBinId = localStorage.getItem('jsonbin_bin_id') || '';
let isJsonbinSyncing = false;

// ===== Holdings Management =====
// Calculate holdings based on all trades up to a specific date
// For each day, process buys first then sells (for day trading support)
function calculateHoldings(upToDate = null) {
  const holdings = new Map(); // symbol -> { quantity, totalCost, avgPrice, market }
  
  // Sort days by date
  const sortedDays = [...DAYS]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  for (const day of sortedDays) {
    if (upToDate && day.date > upToDate) break;
    
    if (!day.trades) continue;
    
    // Separate buys and sells for this day
    const buys = day.trades.filter(t => t.action === 'buy');
    const sells = day.trades.filter(t => t.action === 'sell');
    
    // Process all buys first
    for (const trade of buys) {
      if (!trade.symbol || !trade.quantity || !trade.price) continue;
      
      const symbol = trade.symbol.toUpperCase();
      const quantity = Number(trade.quantity) || 0;
      const price = Number(trade.price) || 0;
      
      if (!holdings.has(symbol)) {
        holdings.set(symbol, { 
          quantity: 0, 
          totalCost: 0, 
          avgPrice: 0, 
          market: trade.market || 'tse' 
        });
      }
      
      const holding = holdings.get(symbol);
      holding.totalCost += quantity * price;
      holding.quantity += quantity;
      holding.avgPrice = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
      
      if (trade.market) {
        holding.market = trade.market;
      }
    }
    
    // Then process all sells
    for (const trade of sells) {
      if (!trade.symbol || !trade.quantity || !trade.price) continue;
      
      const symbol = trade.symbol.toUpperCase();
      const quantity = Number(trade.quantity) || 0;
      
      if (!holdings.has(symbol)) continue;
      
      const holding = holdings.get(symbol);
      
      if (holding.quantity > 0) {
        const sellQuantity = Math.min(quantity, holding.quantity);
        const costBasis = sellQuantity * holding.avgPrice;
        holding.totalCost -= costBasis;
        holding.quantity -= sellQuantity;
        if (holding.quantity <= 0) {
          holding.quantity = 0;
          holding.totalCost = 0;
          holding.avgPrice = 0;
        } else {
          holding.avgPrice = holding.totalCost / holding.quantity;
        }
      }
    }
  }
  
  // Remove zero holdings
  for (const [symbol, holding] of holdings) {
    if (holding.quantity <= 0) {
      holdings.delete(symbol);
    }
  }
  
  return holdings;
}

// Calculate profit for a sell trade based on holdings at that point
function calculateTradeProfit(trade, holdingsBeforeTrade) {
  if (trade.action !== 'sell') return 0;
  
  const symbol = trade.symbol?.toUpperCase();
  if (!symbol) return 0;
  
  const holding = holdingsBeforeTrade.get(symbol);
  if (!holding || holding.quantity <= 0) return 0;
  
  const sellQuantity = Math.min(Number(trade.quantity) || 0, holding.quantity);
  const sellPrice = Number(trade.price) || 0;
  const costBasis = sellQuantity * holding.avgPrice;
  const revenue = sellQuantity * sellPrice;
  
  return revenue - costBasis;
}

// Calculate daily profit for a day
// Logic: Process all buys first, then sells (for same-day trading / day trading)
function calculateDayProfit(day) {
  if (!day.trades) return 0;
  
  // Get holdings before this day
  const holdingsBeforeDay = calculateHoldings(
    new Date(new Date(day.date).getTime() - 86400000).toISOString().split('T')[0]
  );
  
  const tempHoldings = new Map();
  
  // Deep copy holdings
  for (const [symbol, holding] of holdingsBeforeDay) {
    tempHoldings.set(symbol, { ...holding });
  }
  
  // Separate buys and sells
  const buys = day.trades.filter(t => t.action === 'buy');
  const sells = day.trades.filter(t => t.action === 'sell');
  
  // Process all buys first (add to holdings)
  for (const trade of buys) {
    if (!trade.symbol || !trade.quantity || !trade.price) continue;
    
    const symbol = trade.symbol.toUpperCase();
    const quantity = Number(trade.quantity) || 0;
    const price = Number(trade.price) || 0;
    
    if (!tempHoldings.has(symbol)) {
      tempHoldings.set(symbol, { quantity: 0, totalCost: 0, avgPrice: 0, market: trade.market || 'tse' });
    }
    
    const holding = tempHoldings.get(symbol);
    holding.totalCost += quantity * price;
    holding.quantity += quantity;
    holding.avgPrice = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
  }
  
  // Then process all sells and calculate profit
  let dayProfit = 0;
  
  for (const trade of sells) {
    if (!trade.symbol || !trade.quantity || !trade.price) continue;
    
    const symbol = trade.symbol.toUpperCase();
    const quantity = Number(trade.quantity) || 0;
    const price = Number(trade.price) || 0;
    
    const holding = tempHoldings.get(symbol);
    if (!holding || holding.quantity <= 0) continue;
    
    const sellQuantity = Math.min(quantity, holding.quantity);
    const costBasis = sellQuantity * holding.avgPrice;
    const revenue = sellQuantity * price;
    
    dayProfit += revenue - costBasis;
    
    // Update holdings after sell
    holding.totalCost -= costBasis;
    holding.quantity -= sellQuantity;
    if (holding.quantity <= 0) {
      holding.quantity = 0;
      holding.totalCost = 0;
      holding.avgPrice = 0;
    } else {
      holding.avgPrice = holding.totalCost / holding.quantity;
    }
  }
  
  return dayProfit;
}

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
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#f59e0b',
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

function updateChart(range = 'week', chartType = 'cumulative') {
  if (!profitChart) return;
  
  const openDays = DAYS
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
  
  const labels = filteredDays.map(day => {
    const dateInfo = formatDate(day.date);
    return `${dateInfo.month}${dateInfo.day}日`;
  });
  
  let data;
  if (chartType === 'daily') {
    data = filteredDays.map(day => calculateDayProfit(day));
  } else {
    let cumulative = 0;
    data = filteredDays.map(day => {
      cumulative += calculateDayProfit(day);
      return cumulative;
    });
  }
  
  profitChart.data.labels = labels;
  profitChart.data.datasets[0].data = data;
  profitChart.data.datasets[0].fill = chartType === 'daily' ? 'origin' : true;
  
  profitChart.options.plugins.tooltip.callbacks.label = (item) =>
    chartType === 'daily' ? `当日: ${formatMoneyShort(item.raw)}` : `累计: ${formatMoneyShort(item.raw)}`;
  
  profitChart.options.scales.y.beginAtZero = chartType === 'daily';
  
  const ctx = $('#profitChart').getContext('2d');
  
  if (chartType === 'daily') {
    profitChart.data.datasets[0].borderColor = '#f59e0b';
    profitChart.data.datasets[0].backgroundColor = 'rgba(245, 158, 11, 0.15)';
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    const lastVal = data[data.length - 1];
    if (lastVal >= 0) {
      gradient.addColorStop(0, 'rgba(52, 211, 153, 0.3)');
      gradient.addColorStop(1, 'rgba(52, 211, 153, 0)');
      profitChart.data.datasets[0].borderColor = '#34d399';
    } else {
      gradient.addColorStop(0, 'rgba(248, 113, 113, 0.3)');
      gradient.addColorStop(1, 'rgba(248, 113, 113, 0)');
      profitChart.data.datasets[0].borderColor = '#f87171';
    }
    profitChart.data.datasets[0].backgroundColor = gradient;
  }
  
  profitChart.update();
}

// ===== Summary Stats =====
function updateSummary() {
  const openDays = DAYS;
  
  let totalProfit = 0;
  let winDays = 0;
  
  openDays.forEach(day => {
    const dayProfit = calculateDayProfit(day);
    totalProfit += dayProfit;
    if (dayProfit > 0) winDays++;
  });
  
  const tradeDays = openDays.length;
  const winRate = tradeDays > 0 ? Math.round((winDays / tradeDays) * 100) : 0;
  
  const profitEl = $('#totalProfit');
  profitEl.textContent = formatMoneyShort(totalProfit);
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

function getFilteredDays() {
  let filteredDays = DAYS;
  
  if (currentFilter !== 'all') {
    filteredDays = DAYS.filter(d => {
      const date = new Date(d.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return key === currentFilter;
    });
  }
  
  return filteredDays;
}

function renderRecords() {
  const list = $('#recordsList');
  const pagination = $('#recordsPagination');
  
  const filteredDays = getFilteredDays();
  
  if (filteredDays.length === 0) {
    list.innerHTML = `
      <div class="empty-state" id="emptyState">
        <div class="empty-icon">📝</div>
        <div class="empty-title">还没有记录</div>
        <div class="empty-desc">点击上方按钮开始记录你的第一天</div>
      </div>
    `;
    pagination.hidden = true;
    return;
  }
  
  const totalPages = Math.ceil(filteredDays.length / RECORDS_PER_PAGE);
  
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  
  const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
  const endIndex = startIndex + RECORDS_PER_PAGE;
  const pageDays = filteredDays.slice(startIndex, endIndex);
  
  list.innerHTML = pageDays.map(day => {
    const dateInfo = formatDate(day.date);
    
    let tradesInfo = '';
    let profitHtml = '';
    
    if (day.trades?.length > 0) {
      // Show trade summary
      const buyCount = day.trades.filter(t => t.action === 'buy').length;
      const sellCount = day.trades.filter(t => t.action === 'sell').length;
      const symbols = [...new Set(day.trades.map(t => t.symbol).filter(Boolean))];
      const symbolNames = symbols.map(s => getStockDisplayName(s)).join(', ');
      
      tradesInfo = symbolNames || '无交易';
      if (buyCount > 0 || sellCount > 0) {
        tradesInfo += ` (买${buyCount}/卖${sellCount})`;
      }
      
      const totalProfit = calculateDayProfit(day);
      const profitClass = totalProfit > 0 ? 'positive' : (totalProfit < 0 ? 'negative' : 'zero');
      profitHtml = `<div class="record-profit ${profitClass}">${formatMoney(totalProfit)}</div>`;
    } else {
      tradesInfo = '无交易记录';
      profitHtml = `<div class="record-profit zero">¥0</div>`;
    }
    
    return `
      <div class="record-item" data-id="${day.id}">
        <div class="record-date">
          <div class="day">${dateInfo.day}</div>
          <div class="month">${dateInfo.month}</div>
        </div>
        <div class="record-info">
          <div class="record-trades">${tradesInfo}</div>
        </div>
        ${profitHtml}
      </div>
    `;
  }).join('');
  
  const prevBtn = $('#btnPrevPage');
  const nextBtn = $('#btnNextPage');
  
  if (totalPages > 1) {
    pagination.hidden = false;
    $('#paginationInfo').textContent = `${currentPage} / ${totalPages}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  } else {
    pagination.hidden = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }
  
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
  const subtitle = $('#sheetSubtitle');
  const deleteBtn = $('#btnDeleteDay');
  
  currentEditDay = day;
  tradeEntries = [];
  isEditMode = (mode === 'edit');
  
  if (mode === 'add') {
    title.textContent = '添加记录';
    subtitle.textContent = '选择日期并输入交易明细';
    deleteBtn.hidden = true;
    $('#fDayId').value = '';
    $('#fDate').value = todayStr();
    // 直接显示交易输入界面
    $('#tradesSection').hidden = false;
    tradeEntries = [createEmptyTrade()];
    renderTradeEntries();
  } else {
    title.textContent = '查看记录';
    subtitle.textContent = '选择日期并输入交易明细';
    deleteBtn.hidden = false;
    $('#fDayId').value = day.id;
    $('#fDate').value = day.date;
    // 编辑模式下也直接显示交易输入界面
    $('#tradesSection').hidden = false;
    tradeEntries = day.trades?.map(t => ({ ...t, isExisting: true })) || [];
    if (tradeEntries.length === 0) {
      tradeEntries.push(createEmptyTrade());
    }
    renderTradeEntries();
  }
  
  sheet.setAttribute('aria-hidden', 'false');
}

function createEmptyTrade() {
  return {
    symbol: '',
    action: 'buy',
    market: 'tse',
    quantity: '',
    price: ''
  };
}

function closeDaySheet() {
  $('#daySheet').setAttribute('aria-hidden', 'true');
  currentEditDay = null;
  tradeEntries = [];
}


function renderTradeEntries() {
  const container = $('#tradesListForm');
  
  container.innerHTML = tradeEntries.map((trade, index) => {
    const companyName = trade.symbol ? getCompanyName(trade.symbol) : '';
    const showCompanyName = companyName && companyName !== trade.symbol;
    const isExisting = trade.isExisting === true;
    const readonlyAttr = isExisting ? 'readonly disabled' : '';
    const disabledClass = isExisting ? 'disabled' : '';
    
    // For existing trades, show as read-only display
    if (isExisting) {
      const actionText = trade.action === 'buy' ? '买入' : '卖出';
      const marketText = trade.market === 'pts' ? 'PTS' : '东证';
      const actionClass = trade.action === 'buy' ? 'buy' : 'sell';
      
      return `
        <div class="trade-entry existing" data-index="${index}">
          <div class="trade-row">
            <div class="trade-display-group">
              <span class="trade-symbol">${trade.symbol}</span>
              <span class="trade-company-name">${showCompanyName ? companyName : ''}</span>
            </div>
            <button type="button" class="remove-trade-btn existing-remove">×</button>
          </div>
          <div class="trade-row trade-details">
            <span class="trade-tag ${actionClass}">${actionText}</span>
            <span class="trade-tag market">${marketText}</span>
            <span class="trade-info">${trade.quantity}股 × ¥${trade.price}</span>
          </div>
          <div class="trade-amount">
            金额: ${formatMoneyShort((Number(trade.quantity) || 0) * (Number(trade.price) || 0))}
          </div>
        </div>
      `;
    }
    
    // For new trades, show editable form
    return `
      <div class="trade-entry" data-index="${index}">
        <div class="trade-row">
          <div class="trade-input-group symbol-group">
            <input type="text" 
                   class="form-input symbol-input" 
                   placeholder="股票代码" 
                   value="${trade.symbol || ''}"
                   data-field="symbol" />
            <div class="company-name-hint ${showCompanyName ? 'visible' : ''}" data-hint-index="${index}">
              ${showCompanyName ? companyName : ''}
            </div>
          </div>
          <button type="button" class="remove-trade-btn" ${tradeEntries.length <= 1 && !isEditMode ? 'style="visibility:hidden"' : ''}>×</button>
        </div>
        <div class="trade-row">
          <div class="trade-select-group">
            <select class="form-select action-select" data-field="action">
              <option value="buy" ${trade.action === 'buy' ? 'selected' : ''}>买入</option>
              <option value="sell" ${trade.action === 'sell' ? 'selected' : ''}>卖出</option>
            </select>
            <select class="form-select market-select" data-field="market">
              <option value="tse" ${trade.market === 'tse' ? 'selected' : ''}>东证</option>
              <option value="pts" ${trade.market === 'pts' ? 'selected' : ''}>PTS</option>
            </select>
          </div>
        </div>
        <div class="trade-row">
          <input type="number" 
                 class="form-input quantity-input" 
                 placeholder="数量" 
                 value="${trade.quantity || ''}"
                 min="1"
                 step="1"
                 data-field="quantity" />
          <input type="number" 
                 class="form-input price-input" 
                 placeholder="单价 (¥)" 
                 value="${trade.price || ''}"
                 step="0.01"
                 data-field="price" />
        </div>
        <div class="trade-amount">
          金额: ${formatMoneyShort((Number(trade.quantity) || 0) * (Number(trade.price) || 0))}
        </div>
      </div>
    `;
  }).join('');
  
  // Bind input events for new (editable) entries only
  container.querySelectorAll('.trade-entry:not(.existing) .form-input, .trade-entry:not(.existing) .form-select').forEach(input => {
    input.addEventListener('input', (e) => {
      const entry = e.target.closest('.trade-entry');
      const index = parseInt(entry.dataset.index);
      const field = e.target.dataset.field;
      tradeEntries[index][field] = e.target.value;
      
      // Update company name hint when symbol changes
      if (field === 'symbol') {
        const hint = entry.querySelector('.company-name-hint');
        const companyName = getCompanyName(e.target.value);
        const showHint = companyName && companyName !== e.target.value;
        
        if (showHint) {
          hint.textContent = companyName;
          hint.classList.add('visible');
        } else {
          hint.textContent = '';
          hint.classList.remove('visible');
        }
      }
      
      // Update amount display
      if (field === 'quantity' || field === 'price') {
        const amountEl = entry.querySelector('.trade-amount');
        const qty = Number(tradeEntries[index].quantity) || 0;
        const price = Number(tradeEntries[index].price) || 0;
        amountEl.textContent = `金额: ${formatMoneyShort(qty * price)}`;
      }
      
      updateDailyTotal();
    });
    
    input.addEventListener('change', (e) => {
      const entry = e.target.closest('.trade-entry');
      const index = parseInt(entry.dataset.index);
      const field = e.target.dataset.field;
      tradeEntries[index][field] = e.target.value;
      updateDailyTotal();
    });
  });
  
  // Bind remove buttons for new entries
  container.querySelectorAll('.trade-entry:not(.existing) .remove-trade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const entry = e.target.closest('.trade-entry');
      const index = parseInt(entry.dataset.index);
      tradeEntries.splice(index, 1);
      renderTradeEntries();
      updateDailyTotal();
    });
  });
  
  // Bind remove buttons for existing entries (with confirmation)
  container.querySelectorAll('.trade-entry.existing .remove-trade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const entry = e.target.closest('.trade-entry');
      const index = parseInt(entry.dataset.index);
      const trade = tradeEntries[index];
      const companyName = getCompanyName(trade.symbol) || trade.symbol;
      const actionText = trade.action === 'buy' ? '买入' : '卖出';
      
      if (confirm(`确定要删除这条交易记录吗？\n\n${companyName} ${actionText} ${trade.quantity}股 × ¥${trade.price}`)) {
        tradeEntries.splice(index, 1);
        renderTradeEntries();
        updateDailyTotal();
      }
    });
  });
  
  updateDailyTotal();
}

function updateDailyTotal() {
  // Calculate estimated profit for today's sells
  // Process buys first, then sells (for day trading support)
  const currentDate = $('#fDate').value;
  const holdingsBeforeDay = calculateHoldings(
    new Date(new Date(currentDate).getTime() - 86400000).toISOString().split('T')[0]
  );
  
  const tempHoldings = new Map();
  
  // Deep copy holdings
  for (const [symbol, holding] of holdingsBeforeDay) {
    tempHoldings.set(symbol, { ...holding });
  }
  
  // Separate buys and sells
  const buys = tradeEntries.filter(t => t.action === 'buy');
  const sells = tradeEntries.filter(t => t.action === 'sell');
  
  // Process all buys first
  for (const trade of buys) {
    if (!trade.symbol || !trade.quantity || !trade.price) continue;
    
    const symbol = trade.symbol.toUpperCase();
    const quantity = Number(trade.quantity) || 0;
    const price = Number(trade.price) || 0;
    
    if (!tempHoldings.has(symbol)) {
      tempHoldings.set(symbol, { quantity: 0, totalCost: 0, avgPrice: 0 });
    }
    
    const holding = tempHoldings.get(symbol);
    holding.totalCost += quantity * price;
    holding.quantity += quantity;
    holding.avgPrice = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
  }
  
  // Then calculate profit from sells
  let estimatedProfit = 0;
  
  for (const trade of sells) {
    if (!trade.symbol || !trade.quantity || !trade.price) continue;
    
    const symbol = trade.symbol.toUpperCase();
    const quantity = Number(trade.quantity) || 0;
    const price = Number(trade.price) || 0;
    
    const holding = tempHoldings.get(symbol);
    if (holding && holding.quantity > 0) {
      const sellQuantity = Math.min(quantity, holding.quantity);
      const costBasis = sellQuantity * holding.avgPrice;
      const revenue = sellQuantity * price;
      estimatedProfit += revenue - costBasis;
      
      // Update holdings after sell
      holding.totalCost -= costBasis;
      holding.quantity -= sellQuantity;
      if (holding.quantity <= 0) {
        holding.quantity = 0;
        holding.totalCost = 0;
        holding.avgPrice = 0;
      } else {
        holding.avgPrice = holding.totalCost / holding.quantity;
      }
    }
  }
  
  const el = $('#dailyTotal');
  el.textContent = formatMoney(estimatedProfit);
  el.className = 'daily-total';
  if (estimatedProfit > 0) el.classList.add('positive');
  else if (estimatedProfit < 0) el.classList.add('negative');
}

// ===== Settings Sheet =====
function openSettings() {
  $('#settingsSheet').setAttribute('aria-hidden', 'false');
  initJsonbinSyncStatus();
}

function closeSettings() {
  $('#settingsSheet').setAttribute('aria-hidden', 'true');
}

// ===== Analysis Page =====
function openAnalysisPage() {
  $('#mainPage').hidden = true;
  $('#analysisPage').hidden = false;
  updateAnalysisPage();
}

function closeAnalysisPage() {
  $('#analysisPage').hidden = true;
  $('#mainPage').hidden = false;
}

function updateAnalysisPage() {
  updateAnalysisSummary();
  updateHoldingsList();
  updateStockRanking();
  updateTradingStats();
  updateMonthlyChart();
  updateBestWorstDays();
}

function updateAnalysisSummary() {
  const openDays = DAYS;
  
  let totalProfit = 0;
  let winDays = 0;
  let lossDays = 0;
  const stockSet = new Set();
  
  openDays.forEach(day => {
    const dayProfit = calculateDayProfit(day);
    totalProfit += dayProfit;
    
    if (dayProfit > 0) winDays++;
    else if (dayProfit < 0) lossDays++;
    
    day.trades?.forEach(t => {
      if (t.symbol) stockSet.add(t.symbol.toUpperCase());
    });
  });
  
  const profitEl = $('#analysisTotalProfit');
  profitEl.textContent = formatMoneyShort(totalProfit);
  profitEl.style.color = totalProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)';
  
  $('#analysisWinDays').textContent = winDays;
  $('#analysisLossDays').textContent = lossDays;
  $('#analysisStockCount').textContent = stockSet.size;
}

function updateHoldingsList() {
  const container = $('#holdingsList');
  const pagination = $('#holdingsPagination');
  const holdings = calculateHoldings();
  
  if (holdings.size === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">暂无持仓</div>
      </div>
    `;
    if (pagination) pagination.hidden = true;
    return;
  }
  
  const holdingsArray = Array.from(holdings.entries())
    .map(([symbol, data]) => ({ symbol, ...data }))
    .sort((a, b) => (b.quantity * b.avgPrice) - (a.quantity * a.avgPrice));
  
  const totalPages = Math.ceil(holdingsArray.length / ITEMS_PER_PAGE);
  if (holdingsPage > totalPages) holdingsPage = totalPages;
  if (holdingsPage < 1) holdingsPage = 1;
  
  const startIndex = (holdingsPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageItems = holdingsArray.slice(startIndex, endIndex);
  
  container.innerHTML = pageItems.map(holding => {
    const displayName = getStockDisplayName(holding.symbol);
    const totalValue = holding.quantity * holding.avgPrice;
    const marketLabel = holding.market === 'pts' ? 'PTS' : '东证';
    
    return `
      <div class="holding-item">
        <div class="holding-info">
          <div class="holding-name">${displayName}</div>
          <div class="holding-details">${holding.symbol} · ${marketLabel}</div>
        </div>
        <div class="holding-data">
          <div class="holding-quantity">${holding.quantity}股</div>
          <div class="holding-avg">均价: ${formatMoneyShort(holding.avgPrice)}</div>
          <div class="holding-value">市值: ${formatMoneyShort(totalValue)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Update pagination
  if (pagination) {
    if (totalPages > 1) {
      pagination.hidden = false;
      $('#holdingsPaginationInfo').textContent = `${holdingsPage} / ${totalPages}`;
      $('#btnHoldingsPrev').disabled = holdingsPage <= 1;
      $('#btnHoldingsNext').disabled = holdingsPage >= totalPages;
    } else {
      pagination.hidden = true;
    }
  }
}

function updateStockRanking() {
  const container = $('#stockRanking');
  
  // Aggregate realized profit by stock symbol
  // Process buys first, then sells for each day
  const stockMap = new Map();
  
  DAYS.forEach(day => {
    if (!day.trades) return;
    
    // Get holdings before this day
    const holdingsBeforeDay = calculateHoldings(
      new Date(new Date(day.date).getTime() - 86400000).toISOString().split('T')[0]
    );
    
    const tempHoldings = new Map();
    for (const [symbol, holding] of holdingsBeforeDay) {
      tempHoldings.set(symbol, { ...holding });
    }
    
    // Separate buys and sells
    const buys = day.trades.filter(t => t.action === 'buy');
    const sells = day.trades.filter(t => t.action === 'sell');
    
    // Count and process buys first
    for (const trade of buys) {
      if (!trade.symbol) continue;
      const symbol = trade.symbol.toUpperCase();
      
      if (!stockMap.has(symbol)) {
        stockMap.set(symbol, { symbol, profit: 0, buyCount: 0, sellCount: 0 });
      }
      stockMap.get(symbol).buyCount++;
      
      if (trade.quantity && trade.price) {
        const quantity = Number(trade.quantity) || 0;
        const price = Number(trade.price) || 0;
        
        if (!tempHoldings.has(symbol)) {
          tempHoldings.set(symbol, { quantity: 0, totalCost: 0, avgPrice: 0 });
        }
        
        const holding = tempHoldings.get(symbol);
        holding.totalCost += quantity * price;
        holding.quantity += quantity;
        holding.avgPrice = holding.quantity > 0 ? holding.totalCost / holding.quantity : 0;
      }
    }
    
    // Then process sells and calculate profit
    for (const trade of sells) {
      if (!trade.symbol) continue;
      const symbol = trade.symbol.toUpperCase();
      
      if (!stockMap.has(symbol)) {
        stockMap.set(symbol, { symbol, profit: 0, buyCount: 0, sellCount: 0 });
      }
      const stock = stockMap.get(symbol);
      stock.sellCount++;
      
      // Calculate profit for this sell
      const holding = tempHoldings.get(symbol);
      if (holding && holding.quantity > 0 && trade.quantity && trade.price) {
        const quantity = Number(trade.quantity) || 0;
        const price = Number(trade.price) || 0;
        const sellQuantity = Math.min(quantity, holding.quantity);
        const costBasis = sellQuantity * holding.avgPrice;
        const revenue = sellQuantity * price;
        stock.profit += revenue - costBasis;
        
        // Update holdings after sell
        holding.totalCost -= costBasis;
        holding.quantity -= sellQuantity;
        if (holding.quantity <= 0) {
          holding.quantity = 0;
          holding.totalCost = 0;
          holding.avgPrice = 0;
        } else {
          holding.avgPrice = holding.totalCost / holding.quantity;
        }
      }
    }
  });
  
  const stocks = Array.from(stockMap.values())
    .filter(s => s.sellCount > 0) // Only show stocks with realized profits
    .sort((a, b) => b.profit - a.profit);
  
  const pagination = $('#stockRankingPagination');
  
  if (stocks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📈</div>
        <div class="empty-title">暂无数据</div>
        <div class="empty-desc">开始记录交易后这里会显示排行</div>
      </div>
    `;
    if (pagination) pagination.hidden = true;
    return;
  }
  
  const totalPages = Math.ceil(stocks.length / ITEMS_PER_PAGE);
  if (stockRankingPage > totalPages) stockRankingPage = totalPages;
  if (stockRankingPage < 1) stockRankingPage = 1;
  
  const startIndex = (stockRankingPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageStocks = stocks.slice(startIndex, endIndex);
  
  container.innerHTML = pageStocks.map((stock, pageIndex) => {
    const actualIndex = startIndex + pageIndex;
    let rankClass = '';
    if (actualIndex === 0) rankClass = 'gold';
    else if (actualIndex === 1) rankClass = 'silver';
    else if (actualIndex === 2) rankClass = 'bronze';
    
    const profitClass = stock.profit >= 0 ? 'positive' : 'negative';
    const displayName = getStockDisplayName(stock.symbol);
    const showCode = displayName !== stock.symbol;
    
    return `
      <div class="stock-rank-item">
        <div class="rank-number ${rankClass}">${actualIndex + 1}</div>
        <div class="stock-rank-info">
          <div class="stock-rank-symbol">${displayName}</div>
          <div class="stock-rank-trades">${showCode ? `${stock.symbol} · ` : ''}买${stock.buyCount}/卖${stock.sellCount}</div>
        </div>
        <div class="stock-rank-profit ${profitClass}">${formatMoney(stock.profit)}</div>
      </div>
    `;
  }).join('');
  
  // Update pagination
  if (pagination) {
    if (totalPages > 1) {
      pagination.hidden = false;
      $('#stockRankingPaginationInfo').textContent = `${stockRankingPage} / ${totalPages}`;
      $('#btnStockRankingPrev').disabled = stockRankingPage <= 1;
      $('#btnStockRankingNext').disabled = stockRankingPage >= totalPages;
    } else {
      pagination.hidden = true;
    }
  }
}

function updateTradingStats() {
  let totalBuyCount = 0;
  let totalSellCount = 0;
  let tradingDays = 0;
  
  DAYS.forEach(day => {
    
    const hasTrades = day.trades && day.trades.length > 0;
    if (hasTrades) tradingDays++;
    
    day.trades?.forEach(trade => {
      if (trade.action === 'buy') totalBuyCount++;
      else if (trade.action === 'sell') totalSellCount++;
    });
  });
  
  const avgDaily = tradingDays > 0 ? ((totalBuyCount + totalSellCount) / tradingDays).toFixed(1) : 0;
  
  $('#totalBuyCount').textContent = totalBuyCount;
  $('#totalSellCount').textContent = totalSellCount;
  $('#avgDailyTrades').textContent = avgDaily;
}

function updateMonthlyChart() {
  const ctx = $('#monthlyChart');
  if (!ctx) return;
  
  if (monthlyChart) {
    monthlyChart.destroy();
  }
  
  const monthMap = new Map();
  
  DAYS.forEach(day => {
    const date = new Date(day.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const dayProfit = calculateDayProfit(day);
    
    if (!monthMap.has(key)) {
      monthMap.set(key, 0);
    }
    monthMap.set(key, monthMap.get(key) + dayProfit);
  });
  
  const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  const labels = sortedMonths.map(([key]) => {
    const [year, month] = key.split('-');
    return `${year}/${month}`;
  });
  
  const data = sortedMonths.map(([, profit]) => profit);
  const colors = data.map(v => v >= 0 ? '#34d399' : '#f87171');
  
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
  
  monthlyChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '月度收益',
        data,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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
            label: (item) => formatMoney(item.raw)
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
            font: { size: 11 }
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

function updateBestWorstDays() {
  const container = $('#bestWorstDays');
  
  const openDays = DAYS;
  
  if (openDays.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📆</div>
        <div class="empty-title">暂无数据</div>
      </div>
    `;
    return;
  }
  
  const daysWithProfit = openDays.map(day => {
    const profit = calculateDayProfit(day);
    return { ...day, totalProfit: profit };
  });
  
  const sorted = [...daysWithProfit].sort((a, b) => b.totalProfit - a.totalProfit);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  
  let html = '';
  
  if (best && best.totalProfit > 0) {
    const dateInfo = formatDate(best.date);
    html += `
      <div class="day-highlight best">
        <div class="day-highlight-icon">🏆</div>
        <div class="day-highlight-info">
          <div class="day-highlight-label">最佳交易日</div>
          <div class="day-highlight-date">${dateInfo.year}年${dateInfo.month}${dateInfo.day}日</div>
        </div>
        <div class="day-highlight-profit">${formatMoney(best.totalProfit)}</div>
      </div>
    `;
  }
  
  if (worst && worst.totalProfit < 0) {
    const dateInfo = formatDate(worst.date);
    html += `
      <div class="day-highlight worst">
        <div class="day-highlight-icon">📉</div>
        <div class="day-highlight-info">
          <div class="day-highlight-label">最差交易日</div>
          <div class="day-highlight-date">${dateInfo.year}年${dateInfo.month}${dateInfo.day}日</div>
        </div>
        <div class="day-highlight-profit">${formatMoney(worst.totalProfit)}</div>
      </div>
    `;
  }
  
  if (!html) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📆</div>
        <div class="empty-title">暂无明显盈亏</div>
      </div>
    `;
  } else {
    container.innerHTML = html;
  }
}

// ===== Dividend Page =====
function openDividendPage() {
  $('#mainPage').hidden = true;
  $('#dividendPage').hidden = false;
  updateDividendPage();
}

function closeDividendPage() {
  $('#dividendPage').hidden = true;
  $('#mainPage').hidden = false;
}

function calculateDividend(profit) {
  const ratio = dividendNumerator / dividendDenominator;
  
  if (profit >= 0) {
    return Math.ceil(profit * ratio * 0.8);
  } else {
    return Math.floor(profit * ratio);
  }
}

function updateDividendPage() {
  updateTodayDividend();
  updateWeekDividend();
  updateDividendHistory();
  updateDividendSummary();
}

/** 获取本周一 0 点的日期字符串 (YYYY-MM-DD) */
function getThisWeekMondayStr() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  return monday.toISOString().split('T')[0];
}

function updateWeekDividend() {
  const container = $('#weekDividend');
  const mondayStr = getThisWeekMondayStr();
  const today = todayStr();
  
  const weekDays = DAYS.filter(d => d.date >= mondayStr && d.date <= today);
  
  if (weekDays.length === 0) {
    container.innerHTML = `
      <div class="dividend-empty">
        <div class="empty-icon">📅</div>
        <div class="empty-title">本周暂无交易记录</div>
      </div>
    `;
    return;
  }
  
  let totalDividend = 0;
  let totalProfit = 0;
  weekDays.forEach(day => {
    const profit = calculateDayProfit(day);
    totalProfit += profit;
    totalDividend += calculateDividend(profit);
  });
  
  const mondayDate = formatDate(mondayStr);
  const todayDate = formatDate(today);
  const amountClass = totalDividend > 0 ? 'positive' : (totalDividend < 0 ? 'negative' : 'zero');
  
  container.innerHTML = `
    <div class="dividend-today-card">
      <div class="dividend-today-date">${mondayDate.month}${mondayDate.day}日 ～ ${todayDate.month}${todayDate.day}日</div>
      <div class="dividend-today-profit">本周收益: ${formatMoney(totalProfit)}</div>
      <div class="dividend-today-amount ${amountClass}">${formatMoney(totalDividend)}</div>
    </div>
  `;
}

function updateTodayDividend() {
  const container = $('#todayDividend');
  const today = todayStr();
  const todayDay = DAYS.find(d => d.date === today);
  
  if (!todayDay) {
    container.innerHTML = `
      <div class="dividend-empty">
        <div class="empty-icon">📅</div>
        <div class="empty-title">今日暂无交易记录</div>
      </div>
    `;
    return;
  }
  
  const profit = calculateDayProfit(todayDay);
  const dividend = calculateDividend(profit);
  
  const dateInfo = formatDate(today);
  const amountClass = dividend > 0 ? 'positive' : (dividend < 0 ? 'negative' : 'zero');
  
  container.innerHTML = `
    <div class="dividend-today-card">
      <div class="dividend-today-date">${dateInfo.year}年${dateInfo.month}${dateInfo.day}日</div>
      <div class="dividend-today-profit">今日收益: ${formatMoney(profit)}</div>
      <div class="dividend-today-amount ${amountClass}">${formatMoney(dividend)}</div>
    </div>
  `;
}

function updateDividendHistory() {
  const container = $('#dividendHistory');
  
  const openDays = DAYS
    .map(day => {
      const profit = calculateDayProfit(day);
      const dividend = calculateDividend(profit);
      return { ...day, profit, dividend };
    })
    .filter(d => d.profit !== 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  
  if (openDays.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎁</div>
        <div class="empty-title">暂无分红记录</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = openDays.map(day => {
    const dateInfo = formatDate(day.date);
    const amountClass = day.dividend >= 0 ? 'positive' : 'negative';
    
    return `
      <div class="dividend-history-item">
        <div>
          <div class="dividend-history-date">${dateInfo.month}${dateInfo.day}日</div>
          <div class="dividend-history-profit">收益: ${formatMoney(day.profit)}</div>
        </div>
        <div class="dividend-history-amount ${amountClass}">${formatMoney(day.dividend)}</div>
      </div>
    `;
  }).join('');
}

function updateDividendSummary() {
  let totalDividend = 0;
  let totalLossShare = 0;
  
  DAYS.forEach(day => {
    const profit = calculateDayProfit(day);
    const dividend = calculateDividend(profit);
    
    if (dividend >= 0) {
      totalDividend += dividend;
    } else {
      totalLossShare += Math.abs(dividend);
    }
  });
  
  const netDividend = totalDividend - totalLossShare;
  
  $('#totalDividend').textContent = formatMoneyShort(totalDividend);
  $('#totalLossShare').textContent = formatMoneyShort(totalLossShare);
  
  const netEl = $('#netDividend');
  netEl.textContent = formatMoney(netDividend);
  netEl.style.color = netDividend >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)';
}

// ===== Export/Import =====
function getExportData() {
  return {
    exportedAt: new Date().toISOString(),
    version: '3.0',
    days: DAYS
  };
}

function exportData() {
  const data = getExportData();
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `甜饼工坊-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportDataToClipboard() {
  if (!confirm('确定要复制所有数据到剪贴板吗？')) {
    return;
  }
  
  const data = getExportData();
  const text = JSON.stringify(data, null, 2);
  
  try {
    await navigator.clipboard.writeText(text);
    alert('已复制到剪贴板！');
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    alert('已复制到剪贴板！');
  }
}

async function exportTodayDataToClipboard() {
  const today = todayStr();
  const day = DAYS.find(d => d.date === today);
  
  if (!day) {
    alert('今日暂无交易记录');
    return;
  }
  
  const data = {
    exportedAt: new Date().toISOString(),
    type: 'today',
    version: '3.0',
    days: [day]
  };
  const text = JSON.stringify(data, null, 2);
  
  try {
    await navigator.clipboard.writeText(text);
    alert('已复制今日数据到剪贴板！');
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    alert('已复制今日数据到剪贴板！');
  }
}

// Convert old format trades to new format
function convertOldTrade(trade) {
  // Old format: { symbol, profit }
  // New format: { symbol, action, market, quantity, price }
  if (trade.action) {
    // Already new format
    return trade;
  }
  
  // Convert old format - assume it was a sell with profit
  const profit = Number(trade.profit) || 0;
  if (profit !== 0) {
    return {
      symbol: trade.symbol || '',
      action: 'sell',
      market: 'tse',
      quantity: 100, // Default quantity
      price: Math.abs(profit / 100) // Estimate price from profit
    };
  }
  
  return null;
}

async function importDataFromText(text) {
  try {
    const data = JSON.parse(text);
    const days = Array.isArray(data) ? data : (data.days || []);
    
    if (!Array.isArray(days)) {
      throw new Error('数据格式不正确');
    }
    
    if (days.length === 0) {
      throw new Error('没有找到有效数据');
    }
    
    for (const day of days) {
      if (!day || !day.id) continue;
      
      // Convert old format trades if necessary
      let trades = day.trades || [];
      if (trades.length > 0 && !trades[0].action) {
        // Old format detected, convert
        trades = trades.map(convertOldTrade).filter(Boolean);
      }
      
      await saveDay({
        id: day.id,
        date: day.date,
        status: 'open', // 固定为 'open'
        trades: trades,
        updatedAt: new Date().toISOString()
      });
    }
    
    return true;
  } catch (err) {
    throw err;
  }
}

async function importData(file) {
  try {
    const text = await file.text();
    await importDataFromText(text);
    
    alert('导入成功！');
    closeSettings();
    await refresh();
  } catch (err) {
    alert('导入失败：' + (err.message || err));
  }
}

/** 导入今日数据并合并到现有记录（不覆盖，同日期则合并交易） */
async function importTodayFromText(text) {
  const data = JSON.parse(text);
  const days = data.days || (data.day ? [data.day] : (Array.isArray(data) ? data : []));
  
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error('没有找到有效的今日数据');
  }
  
  for (const day of days) {
    if (!day || !day.date) continue;
    
    let trades = (day.trades || []).map(t => convertOldTrade(t)).filter(Boolean);
    
    const existing = await getDayByDate(day.date);
    if (existing) {
      const mergedTrades = [...(existing.trades || []), ...trades];
      await saveDay({
        ...existing,
        trades: mergedTrades,
        updatedAt: new Date().toISOString()
      });
    } else {
      await saveDay({
        id: day.id || generateId(),
        date: day.date,
        status: day.status || 'open',
        trades: trades,
        updatedAt: new Date().toISOString()
      });
    }
  }
  
  return true;
}

// ===== Import Paste Sheet =====
/** @param {'replace'|'mergeToday'} mode - replace=覆盖同日期, mergeToday=合并到现有（不覆盖） */
function openImportPasteSheet(mode = 'replace') {
  const sheet = $('#importPasteSheet');
  sheet.dataset.importMode = mode;
  $('#importPasteText').value = '';
  
  const titleEl = sheet.querySelector('.sheet-title');
  const subtitleEl = sheet.querySelector('.sheet-subtitle');
  if (mode === 'mergeToday') {
    titleEl.textContent = '导入今日数据';
    subtitleEl.textContent = '粘贴导出的今日数据，将合并到现有记录（不覆盖）';
  } else {
    titleEl.textContent = '粘贴导入';
    subtitleEl.textContent = '将复制的数据粘贴到下方';
  }
  
  sheet.setAttribute('aria-hidden', 'false');
}

function closeImportPasteSheet() {
  $('#importPasteSheet').setAttribute('aria-hidden', 'true');
  $('#importPasteText').value = '';
}

async function confirmImportPaste() {
  const text = $('#importPasteText').value.trim();
  
  if (!text) {
    alert('请粘贴数据');
    return;
  }
  
  const mode = $('#importPasteSheet').dataset.importMode || 'replace';
  
  try {
    if (mode === 'mergeToday') {
      await importTodayFromText(text);
      alert('导入成功！已合并到现有记录');
    } else {
      await importDataFromText(text);
      alert('导入成功！');
    }
    closeImportPasteSheet();
    closeSettings();
    await refresh();
  } catch (err) {
    alert('导入失败：' + (err.message || err));
  }
}

// ===== JSONBin 云同步 =====
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

function updateJsonbinSyncStatus(text) {
  const el = $('#jsonbinSyncStatus');
  if (el) el.textContent = text;
}

/** 将云端 days 与本地 DAYS 按日期合并，updatedAt 较新者优先 */
async function mergeDaysFromCloud(cloudDays) {
  if (!Array.isArray(cloudDays)) cloudDays = [];
  const byDate = new Map();
  for (const d of DAYS) {
    if (d && d.date) byDate.set(d.date, d);
  }
  for (const d of cloudDays) {
    if (!d || !d.date) continue;
    const local = byDate.get(d.date);
    const cloudUpdated = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
    const localUpdated = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    if (!local || cloudUpdated >= localUpdated) {
      byDate.set(d.date, d);
    }
  }
  const merged = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  merged.forEach(d => {
    if (!d.id) d.id = generateId();
    let trades = d.trades || [];
    if (trades.length > 0 && !trades[0].action) {
      trades = trades.map(convertOldTrade).filter(Boolean);
      d.trades = trades;
    }
  });
  await clearAllDays();
  for (const day of merged) {
    await saveDay(day);
  }
}

async function pushToJsonBin() {
  const apiKeyRaw = ($('#jsonbinApiKey') && $('#jsonbinApiKey').value) || jsonbinApiKey;
  const apiKey = String(apiKeyRaw || '').trim();
  const binIdRaw = ($('#jsonbinBinId') && $('#jsonbinBinId').value) || jsonbinBinId;
  const binId = (typeof binIdRaw === 'string' ? binIdRaw : String(binIdRaw || '')).trim();

  if (!apiKey) {
    alert('请先在下方填写 JSONBin API Key');
    return;
  }

  if (isJsonbinSyncing) return;
  isJsonbinSyncing = true;
  updateJsonbinSyncStatus('上传中…');
  if ($('#btnJsonbinPush')) $('#btnJsonbinPush').disabled = true;
  if ($('#btnJsonbinPull')) $('#btnJsonbinPull').disabled = true;

  const payload = getExportData();
  let bodyStr;
  try {
    bodyStr = JSON.stringify(payload);
  } catch (e) {
    isJsonbinSyncing = false;
    if ($('#btnJsonbinPush')) $('#btnJsonbinPush').disabled = false;
    if ($('#btnJsonbinPull')) $('#btnJsonbinPull').disabled = false;
    updateJsonbinSyncStatus('');
    alert('上传失败：数据无法序列化为 JSON。' + (e && e.message ? e.message : ''));
    return;
  }

  try {
    if (binId) {
      const res = await fetch(`${JSONBIN_BASE}/${binId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': apiKey
        },
        body: bodyStr
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err && err.message ? err.message : `上传失败 (${res.status})`);
      }
    } else {
      const res = await fetch(JSONBIN_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': apiKey,
          'X-Bin-Name': '甜饼工坊-共享数据'
        },
        body: bodyStr
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err && err.message ? err.message : `创建失败 (${res.status})`);
      }
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error('云端返回内容无法解析：' + (e && e.message ? e.message : ''));
      }
      const id = (data && data.metadata && data.metadata.id) || (data && data.id) || null;
      if (id != null) {
        const sid = String(id);
        jsonbinBinId = sid;
        localStorage.setItem('jsonbin_bin_id', sid);
        const input = $('#jsonbinBinId');
        if (input) input.value = sid;
      }
    }

    jsonbinApiKey = apiKey;
    localStorage.setItem('jsonbin_api_key', apiKey);
    const at = new Date().toLocaleString('zh-CN');
    localStorage.setItem('jsonbin_last_sync', JSON.stringify({ at, dir: 'push' }));
    updateJsonbinSyncStatus(`上次同步：${at}（上传）`);
    alert('已上传到云端！对方可用相同 API Key 和 Bin ID「从云端拉取」。');
  } catch (e) {
    updateJsonbinSyncStatus('');
    const msg = (e && e.message) ? e.message : String(e);
    const name = (e && e.name) ? e.name : '';
    const full = (name && name !== 'Error') ? name + ': ' + msg : msg;
    alert('上传失败：' + full);
  } finally {
    isJsonbinSyncing = false;
    if ($('#btnJsonbinPush')) $('#btnJsonbinPush').disabled = false;
    if ($('#btnJsonbinPull')) $('#btnJsonbinPull').disabled = false;
  }
}

async function pullFromJsonBin() {
  const apiKey = ($('#jsonbinApiKey') && $('#jsonbinApiKey').value) || jsonbinApiKey;
  let binId = ($('#jsonbinBinId') && $('#jsonbinBinId').value) || jsonbinBinId;
  binId = (binId || '').trim();

  if (!apiKey || !apiKey.trim()) {
    alert('请先填写 JSONBin API Key');
    return;
  }
  if (!binId) {
    alert('请填写 Bin ID。若还没有，请对方先「上传到云端」一次，再把 Bin ID 发给你。');
    return;
  }

  if (isJsonbinSyncing) return;
  isJsonbinSyncing = true;
  updateJsonbinSyncStatus('拉取中…');
  if ($('#btnJsonbinPush')) $('#btnJsonbinPush').disabled = true;
  if ($('#btnJsonbinPull')) $('#btnJsonbinPull').disabled = true;

  try {
    const res = await fetch(`${JSONBIN_BASE}/${binId}?meta=false`, {
      method: 'GET',
      headers: { 'X-Master-Key': apiKey.trim() }
    });

    if (!res.ok) {
      if (res.status === 404) throw new Error('未找到该 Bin，请检查 Bin ID 是否正确');
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.message || `拉取失败 (${res.status})`);
    }

    const data = await res.json();
    const cloudDays = Array.isArray(data?.days) ? data.days : [];

    await mergeDaysFromCloud(cloudDays);
    await refresh();

    jsonbinApiKey = apiKey.trim();
    jsonbinBinId = binId;
    localStorage.setItem('jsonbin_api_key', jsonbinApiKey);
    localStorage.setItem('jsonbin_bin_id', binId);
    const at = new Date().toLocaleString('zh-CN');
    localStorage.setItem('jsonbin_last_sync', JSON.stringify({ at, dir: 'pull' }));
    updateJsonbinSyncStatus(`上次同步：${at}（拉取）`);
    alert('已从云端拉取并合并！');
  } catch (e) {
    updateJsonbinSyncStatus('');
    alert('拉取失败：' + (e.message || e));
  } finally {
    isJsonbinSyncing = false;
    if ($('#btnJsonbinPush')) $('#btnJsonbinPush').disabled = false;
    if ($('#btnJsonbinPull')) $('#btnJsonbinPull').disabled = false;
  }
}

function initJsonbinSyncStatus() {
  try {
    const raw = localStorage.getItem('jsonbin_last_sync');
    if (!raw) {
      updateJsonbinSyncStatus('从未同步');
      return;
    }
    const { at, dir } = JSON.parse(raw);
    updateJsonbinSyncStatus(`上次同步：${at}（${dir === 'push' ? '上传' : '拉取'}）`);
  } catch {
    updateJsonbinSyncStatus('从未同步');
  }
}

// ===== Refresh =====
async function refresh() {
  DAYS = await getAllDays();
  updateSummary();
  updateMonthFilter();
  renderRecords();
  const range = $('.chart-tab[data-range].active')?.dataset.range || 'week';
  const chartType = $('.chart-tab[data-type].active')?.dataset.type || 'cumulative';
  updateChart(range, chartType);
}

// ===== Event Bindings =====
function bindEvents() {
  // Add day button
  $('#btnAddDay').addEventListener('click', () => openDaySheet('add'));
  
  // Analysis button
  $('#btnAnalysis').addEventListener('click', openAnalysisPage);
  $('#btnBackFromAnalysis').addEventListener('click', closeAnalysisPage);
  
  // Dividend button
  $('#btnDividend').addEventListener('click', openDividendPage);
  $('#btnBackFromDividend').addEventListener('click', closeDividendPage);
  
  // AI Assistant button
  $('#btnAIAssistant').addEventListener('click', openAIPage);
  $('#btnBackFromAI').addEventListener('click', closeAIPage);
  
  // AI Chat events
  $('#btnSendTradeData').addEventListener('click', startTradeDataChat);
  $('#btnAskOther').addEventListener('click', startGeneralChat);
  
  $('#chatInput').addEventListener('input', (e) => {
    updateSendButtonState();
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });
  
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
  
  $('#btnSendMessage').addEventListener('click', handleSendMessage);
  
  // API Key input
  $('#openaiApiKey').addEventListener('input', (e) => {
    openaiApiKey = e.target.value.trim();
    localStorage.setItem('openai_api_key', openaiApiKey);
  });
  
  $('#btnToggleApiKey').addEventListener('click', () => {
    const input = $('#openaiApiKey');
    if (input.type === 'password') {
      input.type = 'text';
      $('#btnToggleApiKey').textContent = '🙈';
    } else {
      input.type = 'password';
      $('#btnToggleApiKey').textContent = '👁';
    }
  });
  
  // Dividend ratio inputs
  $('#dividendNumerator').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (value >= 1) {
      dividendNumerator = value;
      updateDividendPage();
    }
  });
  
  $('#dividendDenominator').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (value >= 1) {
      dividendDenominator = value;
      updateDividendPage();
    }
  });
  
  // Sheet close buttons
  $('#btnCloseSheet').addEventListener('click', closeDaySheet);
  $('#btnCancelSheet').addEventListener('click', closeDaySheet);
  $('#daySheetBackdrop').addEventListener('click', closeDaySheet);
  
  
  // Add trade button
  $('#btnAddTrade').addEventListener('click', () => {
    tradeEntries.push(createEmptyTrade());
    renderTradeEntries();
  });
  
  // Form submit
  $('#dayForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = $('#fDayId').value || generateId();
    const date = $('#fDate').value;
    const status = 'open'; // 固定为 'open'
    
    if (!date) {
      alert('请选择日期');
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
    
    // Filter valid trades and remove isExisting flag
    const validTrades = tradeEntries
      .filter(t => t.symbol && t.quantity && t.price)
      .map(t => ({
        symbol: t.symbol,
        action: t.action,
        market: t.market,
        quantity: t.quantity,
        price: t.price
      }));
    
    const day = {
      id,
      date,
      status,
      trades: validTrades,
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
  const monthFilterEl = $('#monthFilter');
  monthFilterEl.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    currentPage = 1;
    renderRecords();
  });
  monthFilterEl.addEventListener('input', (e) => {
    currentFilter = e.target.value;
    currentPage = 1;
    renderRecords();
  });
  
  // Pagination
  const prevBtn = $('#btnPrevPage');
  const nextBtn = $('#btnNextPage');
  
  prevBtn.addEventListener('click', () => {
    if (prevBtn.disabled) return;
    if (currentPage > 1) {
      currentPage--;
      renderRecords();
      $('#recordsList').scrollTop = 0;
    }
  });
  
  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled) return;
    const filteredDays = getFilteredDays();
    const totalPages = Math.ceil(filteredDays.length / RECORDS_PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      renderRecords();
      $('#recordsList').scrollTop = 0;
    }
  });
  
  // Chart tabs: 周/月/全部 与 累计/每日 分组切换
  $$('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.range) {
        $$('.chart-tab[data-range]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      } else if (tab.dataset.type) {
        $$('.chart-tab[data-type]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
      const range = $('.chart-tab[data-range].active')?.dataset.range || 'week';
      const chartType = $('.chart-tab[data-type].active')?.dataset.type || 'cumulative';
      updateChart(range, chartType);
    });
  });
  
  // Settings
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCloseSettings').addEventListener('click', closeSettings);
  $('#settingsBackdrop').addEventListener('click', closeSettings);
  
  // Export
  $('#btnExport').addEventListener('click', exportData);
  $('#btnExportCopy').addEventListener('click', exportDataToClipboard);
  $('#btnExportTodayCopy').addEventListener('click', exportTodayDataToClipboard);
  
  // Import
  $('#fileImport').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      importData(file);
      e.target.value = '';
    }
  });
  
  $('#btnImportPaste').addEventListener('click', () => openImportPasteSheet('replace'));
  $('#btnImportToday').addEventListener('click', () => openImportPasteSheet('mergeToday'));
  $('#btnCloseImportPaste').addEventListener('click', closeImportPasteSheet);
  $('#btnCancelImportPaste').addEventListener('click', closeImportPasteSheet);
  $('#importPasteBackdrop').addEventListener('click', closeImportPasteSheet);
  $('#btnConfirmImportPaste').addEventListener('click', confirmImportPaste);

  // JSONBin 云同步
  const jsonbinApiKeyEl = $('#jsonbinApiKey');
  const jsonbinBinIdEl = $('#jsonbinBinId');
  if (jsonbinApiKeyEl) {
    jsonbinApiKeyEl.addEventListener('input', (e) => {
      jsonbinApiKey = e.target.value.trim();
      localStorage.setItem('jsonbin_api_key', jsonbinApiKey);
    });
  }
  if (jsonbinBinIdEl) {
    jsonbinBinIdEl.addEventListener('input', (e) => {
      jsonbinBinId = e.target.value.trim();
      localStorage.setItem('jsonbin_bin_id', jsonbinBinId);
    });
  }
  if ($('#btnJsonbinPush')) $('#btnJsonbinPush').addEventListener('click', pushToJsonBin);
  if ($('#btnJsonbinPull')) $('#btnJsonbinPull').addEventListener('click', pullFromJsonBin);
  
  // Clear all
  $('#btnClearAll').addEventListener('click', async () => {
    if (confirm('确定要清空所有数据吗？此操作不可撤销！')) {
      await clearAllDays();
      closeSettings();
      await refresh();
    }
  });
  
  // Clear chat history
  $('#btnClearChatHistory').addEventListener('click', () => {
    if (confirm('确定要清除所有聊天历史吗？')) {
      clearChatHistory();
      alert('聊天历史已清除');
    }
  });
  
  // Holdings pagination
  const btnHoldingsPrev = $('#btnHoldingsPrev');
  const btnHoldingsNext = $('#btnHoldingsNext');
  
  if (btnHoldingsPrev) {
    btnHoldingsPrev.addEventListener('click', () => {
      if (holdingsPage > 1) {
        holdingsPage--;
        updateHoldingsList();
      }
    });
  }
  
  if (btnHoldingsNext) {
    btnHoldingsNext.addEventListener('click', () => {
      holdingsPage++;
      updateHoldingsList();
    });
  }
  
  // Stock ranking pagination
  const btnStockRankingPrev = $('#btnStockRankingPrev');
  const btnStockRankingNext = $('#btnStockRankingNext');
  
  if (btnStockRankingPrev) {
    btnStockRankingPrev.addEventListener('click', () => {
      if (stockRankingPage > 1) {
        stockRankingPage--;
        updateStockRanking();
      }
    });
  }
  
  if (btnStockRankingNext) {
    btnStockRankingNext.addEventListener('click', () => {
      stockRankingPage++;
      updateStockRanking();
    });
  }
  
  // Theme change listener
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  
  const onThemeChange = () => {
    if (profitChart) {
      profitChart.destroy();
      initChart();
      const range = $('.chart-tab[data-range].active')?.dataset.range || 'week';
      const chartType = $('.chart-tab[data-type].active')?.dataset.type || 'cumulative';
      updateChart(range, chartType);
    }
    if (monthlyChart && !$('#analysisPage').hidden) {
      updateMonthlyChart();
    }
  };
  
  if (mql.addEventListener) {
    mql.addEventListener('change', onThemeChange);
  } else if (mql.addListener) {
    mql.addListener(onThemeChange);
  }
}

// ===== AI Assistant =====
function openAIPage() {
  $('#mainPage').hidden = true;
  $('#aiPage').hidden = false;
  
  // Check if API key is set
  if (!openaiApiKey) {
    $('#chatContainer').innerHTML = '';
    showChatMessage('system', '⚠️ 请先在设置中输入 OpenAI API Key');
    $('#quickActions').hidden = true;
    $('#chatInput').disabled = true;
    $('#btnSendMessage').disabled = true;
    return;
  }
  
  // Load chat history from localStorage
  const savedHistory = localStorage.getItem('ai_chat_history');
  const savedMode = localStorage.getItem('ai_chat_mode');
  
  if (savedHistory) {
    try {
      chatHistory = JSON.parse(savedHistory);
      currentChatMode = savedMode || null;
      
      // Restore chat messages
      $('#chatContainer').innerHTML = '';
      chatHistory.forEach(msg => {
        showChatMessage(msg.role, msg.content);
      });
      
      // Hide quick actions if already started
      if (currentChatMode) {
        $('#quickActions').hidden = true;
      } else {
        $('#quickActions').hidden = false;
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
      chatHistory = [];
      currentChatMode = null;
      $('#chatContainer').innerHTML = '';
      $('#quickActions').hidden = false;
    }
  } else {
    // No saved history, start fresh
    chatHistory = [];
    currentChatMode = null;
    $('#chatContainer').innerHTML = '';
    $('#quickActions').hidden = false;
  }
  
  $('#chatInput').disabled = false;
  updateSendButtonState();
  
  // Show welcome message only if no history
  if (chatHistory.length === 0) {
    showChatMessage('assistant', `你好！我是甜饼工坊的 AI 助手 🍪\n\n我可以帮你分析交易数据，或者回答其他问题。请选择下方的选项开始对话：`);
  }
}

function saveChatHistory() {
  localStorage.setItem('ai_chat_history', JSON.stringify(chatHistory));
  if (currentChatMode) {
    localStorage.setItem('ai_chat_mode', currentChatMode);
  }
}

function clearChatHistory() {
  chatHistory = [];
  currentChatMode = null;
  localStorage.removeItem('ai_chat_history');
  localStorage.removeItem('ai_chat_mode');
  $('#chatContainer').innerHTML = '';
  $('#quickActions').hidden = false;
  showChatMessage('assistant', `你好！我是甜饼工坊的 AI 助手 🍪\n\n我可以帮你分析交易数据，或者回答其他问题。请选择下方的选项开始对话：`);
}

function closeAIPage() {
  $('#aiPage').hidden = true;
  $('#mainPage').hidden = false;
}

function showChatMessage(role, content) {
  const container = $('#chatContainer');
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${role}`;
  
  // Convert newlines to <br> and handle basic markdown
  const formattedContent = content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  
  messageEl.innerHTML = formattedContent;
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator() {
  const container = $('#chatContainer');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-message assistant';
  typingEl.id = 'typingIndicator';
  typingEl.innerHTML = `
    <div class="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
  const typingEl = $('#typingIndicator');
  if (typingEl) typingEl.remove();
}

function generateTradeDataPrompt() {
  // Get current holdings
  const holdings = calculateHoldings();
  const holdingsData = Array.from(holdings.entries()).map(([symbol, data]) => ({
    symbol,
    name: getCompanyName(symbol),
    quantity: data.quantity,
    avgPrice: data.avgPrice,
    market: data.market,
    totalValue: data.quantity * data.avgPrice
  }));
  
  // Get all trade history
  const tradeHistory = DAYS
    .filter(d => d.trades?.length > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(day => ({
      date: day.date,
      trades: day.trades.map(t => ({
        symbol: t.symbol,
        name: getCompanyName(t.symbol),
        action: t.action,
        market: t.market,
        quantity: t.quantity,
        price: t.price,
        amount: t.quantity * t.price
      })),
      dayProfit: calculateDayProfit(day)
    }));
  
  // Calculate summary stats
  let totalProfit = 0;
  let winDays = 0;
  let lossDays = 0;
  
  tradeHistory.forEach(day => {
    totalProfit += day.dayProfit;
    if (day.dayProfit > 0) winDays++;
    else if (day.dayProfit < 0) lossDays++;
  });
  
  const systemPrompt = `你是一个专业的股票交易分析助手，名叫"甜饼助手"。用户正在使用一个名为"甜饼工坊"的交易记录应用。

以下是用户的交易数据：

## 当前持仓
${holdingsData.length > 0 ? JSON.stringify(holdingsData, null, 2) : '暂无持仓'}

## 交易历史摘要
- 总交易天数: ${tradeHistory.length} 天
- 盈利天数: ${winDays} 天
- 亏损天数: ${lossDays} 天
- 累计已实现收益: ¥${totalProfit.toLocaleString()}
- 胜率: ${tradeHistory.length > 0 ? Math.round((winDays / tradeHistory.length) * 100) : 0}%

## 详细交易记录（最近30天）
${JSON.stringify(tradeHistory.slice(-30), null, 2)}

请基于以上数据回答用户的问题。你可以：
1. 分析交易表现和盈亏情况
2. 识别交易模式和习惯
3. 提供改进建议
4. 解答关于具体股票的问题

回答时请使用中文，保持友好和专业的语气。如果用户问的问题与交易数据无关，也可以正常回答。`;

  return systemPrompt;
}

async function sendToOpenAI(userMessage) {
  if (!openaiApiKey) {
    showChatMessage('error', '请先在设置中输入 OpenAI API Key');
    return;
  }
  
  if (isAILoading) return;
  
  isAILoading = true;
  $('#btnSendMessage').disabled = true;
  $('#chatInput').disabled = true;
  $$('.quick-action-btn').forEach(btn => btn.disabled = true);
  
  showTypingIndicator();
  
  // Build messages array
  const messages = [];
  
  // Add system prompt based on mode
  if (currentChatMode === 'trade') {
    messages.push({
      role: 'system',
      content: generateTradeDataPrompt()
    });
  } else {
    messages.push({
      role: 'system',
      content: '你是一个友好的AI助手，名叫"甜饼助手"。请用中文回答用户的问题，保持友好和专业的语气。'
    });
  }
  
  // Add chat history (user message is already included)
  chatHistory.forEach(msg => {
    // Skip system messages in history (they're already in the system prompt)
    if (msg.role !== 'system') {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  });
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        messages: messages,
        temperature: 0.7
      })
    });
    
    hideTypingIndicator();
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('API Key 无效，请检查设置');
      } else if (response.status === 429) {
        throw new Error('请求过于频繁，请稍后再试');
      } else {
        throw new Error(errorData.error?.message || `请求失败 (${response.status})`);
      }
    }
    
    const data = await response.json();
    const assistantMessage = data.choices[0]?.message?.content || '抱歉，我无法生成回复。';
    
    // Save assistant message to history
    chatHistory.push({ role: 'assistant', content: assistantMessage });
    
    // Persist chat history
    saveChatHistory();
    
    // Show response
    showChatMessage('assistant', assistantMessage);
    
  } catch (error) {
    hideTypingIndicator();
    showChatMessage('error', `❌ ${error.message}`);
  } finally {
    isAILoading = false;
    $('#btnSendMessage').disabled = false;
    $('#chatInput').disabled = false;
    $$('.quick-action-btn').forEach(btn => btn.disabled = false);
    updateSendButtonState();
  }
}

function updateSendButtonState() {
  const input = $('#chatInput');
  const btn = $('#btnSendMessage');
  btn.disabled = !input.value.trim() || isAILoading || !openaiApiKey;
}

function handleSendMessage() {
  const input = $('#chatInput');
  const message = input.value.trim();
  
  if (!message || isAILoading) return;
  
  // Save user message to history immediately
  chatHistory.push({ role: 'user', content: message });
  saveChatHistory();
  
  // Show user message
  showChatMessage('user', message);
  input.value = '';
  input.style.height = 'auto';
  updateSendButtonState();
  
  // Send to AI
  sendToOpenAI(message);
}

function startTradeDataChat() {
  if (!openaiApiKey) {
    showChatMessage('error', '请先在设置中输入 OpenAI API Key');
    return;
  }
  
  currentChatMode = 'trade';
  $('#quickActions').hidden = true;
  
  // Add system and assistant messages to history
  chatHistory.push({ role: 'system', content: '📊 已加载交易数据，你可以开始提问了' });
  chatHistory.push({ 
    role: 'assistant', 
    content: '我已经获取了你的交易数据！你可以问我：\n\n• 我的整体交易表现如何？\n• 哪只股票给我带来了最多收益？\n• 分析一下我的交易习惯\n• 我目前的持仓情况怎么样？\n• 有什么改进建议吗？\n\n或者任何其他关于你交易的问题！'
  });
  
  saveChatHistory();
  
  showChatMessage('system', '📊 已加载交易数据，你可以开始提问了');
  showChatMessage('assistant', '我已经获取了你的交易数据！你可以问我：\n\n• 我的整体交易表现如何？\n• 哪只股票给我带来了最多收益？\n• 分析一下我的交易习惯\n• 我目前的持仓情况怎么样？\n• 有什么改进建议吗？\n\n或者任何其他关于你交易的问题！');
}

function startGeneralChat() {
  if (!openaiApiKey) {
    showChatMessage('error', '请先在设置中输入 OpenAI API Key');
    return;
  }
  
  currentChatMode = 'general';
  $('#quickActions').hidden = true;
  
  // Add assistant message to history
  chatHistory.push({ 
    role: 'assistant', 
    content: '好的，你想聊些什么呢？我可以回答各种问题 😊'
  });
  
  saveChatHistory();
  
  showChatMessage('assistant', '好的，你想聊些什么呢？我可以回答各种问题 😊');
}

// ===== Initialize =====
async function init() {
  await loadCompanyData();
  initChart();
  bindEvents();
  await refresh();
  
  // Load saved API key
  const savedKey = localStorage.getItem('openai_api_key');
  if (savedKey) {
    openaiApiKey = savedKey;
    $('#openaiApiKey').value = savedKey;
  }
  // JSONBin 云同步
  if ($('#jsonbinApiKey')) $('#jsonbinApiKey').value = jsonbinApiKey;
  if ($('#jsonbinBinId')) $('#jsonbinBinId').value = jsonbinBinId;
}

// Start the app
init();
