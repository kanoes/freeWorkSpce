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

// Dividend settings
let dividendNumerator = 1;
let dividendDenominator = 3;

// ===== Holdings Management =====
// Calculate holdings based on all trades up to a specific date
// For each day, process buys first then sells (for day trading support)
function calculateHoldings(upToDate = null) {
  const holdings = new Map(); // symbol -> { quantity, totalCost, avgPrice, market }
  
  // Sort days by date
  const sortedDays = [...DAYS]
    .filter(d => d.status === 'open')
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
  if (day.status !== 'open' || !day.trades) return 0;
  
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

function updateChart(range = 'week') {
  if (!profitChart) return;
  
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
  
  let cumulative = 0;
  const labels = [];
  const data = [];
  
  filteredDays.forEach(day => {
    const profit = calculateDayProfit(day);
    cumulative += profit;
    
    const dateInfo = formatDate(day.date);
    labels.push(`${dateInfo.month}${dateInfo.day}日`);
    data.push(cumulative);
  });
  
  profitChart.data.labels = labels;
  profitChart.data.datasets[0].data = data;
  
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
  const openDays = DAYS.filter(d => d.status === 'open');
  
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
        tradeEntries.push(createEmptyTrade());
      }
    } else {
      $('#tradesSection').hidden = true;
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

function setStatusSelection(status) {
  $$('.status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  $('#fStatus').value = status;
  
  if (status === 'open') {
    $('#tradesSection').hidden = false;
    if (tradeEntries.length === 0) {
      tradeEntries.push(createEmptyTrade());
    }
    renderTradeEntries();
  } else {
    $('#tradesSection').hidden = true;
  }
}

function renderTradeEntries() {
  const container = $('#tradesListForm');
  
  container.innerHTML = tradeEntries.map((trade, index) => {
    const companyName = trade.symbol ? getCompanyName(trade.symbol) : '';
    const showCompanyName = companyName && companyName !== trade.symbol;
    
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
          <button type="button" class="remove-trade-btn" ${tradeEntries.length <= 1 ? 'style="visibility:hidden"' : ''}>×</button>
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
  
  // Bind input events
  container.querySelectorAll('.form-input, .form-select').forEach(input => {
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
  const openDays = DAYS.filter(d => d.status === 'open');
  
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
  const holdings = calculateHoldings();
  
  if (holdings.size === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">暂无持仓</div>
      </div>
    `;
    return;
  }
  
  const holdingsArray = Array.from(holdings.entries())
    .map(([symbol, data]) => ({ symbol, ...data }))
    .sort((a, b) => (b.quantity * b.avgPrice) - (a.quantity * a.avgPrice));
  
  container.innerHTML = holdingsArray.map(holding => {
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
}

function updateStockRanking() {
  const container = $('#stockRanking');
  
  // Aggregate realized profit by stock symbol
  // Process buys first, then sells for each day
  const stockMap = new Map();
  
  DAYS.forEach(day => {
    if (day.status !== 'open' || !day.trades) return;
    
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
  
  if (stocks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📈</div>
        <div class="empty-title">暂无数据</div>
        <div class="empty-desc">开始记录交易后这里会显示排行</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = stocks.map((stock, index) => {
    let rankClass = '';
    if (index === 0) rankClass = 'gold';
    else if (index === 1) rankClass = 'silver';
    else if (index === 2) rankClass = 'bronze';
    
    const profitClass = stock.profit >= 0 ? 'positive' : 'negative';
    const displayName = getStockDisplayName(stock.symbol);
    const showCode = displayName !== stock.symbol;
    
    return `
      <div class="stock-rank-item">
        <div class="rank-number ${rankClass}">${index + 1}</div>
        <div class="stock-rank-info">
          <div class="stock-rank-symbol">${displayName}</div>
          <div class="stock-rank-trades">${showCode ? `${stock.symbol} · ` : ''}买${stock.buyCount}/卖${stock.sellCount}</div>
        </div>
        <div class="stock-rank-profit ${profitClass}">${formatMoney(stock.profit)}</div>
      </div>
    `;
  }).join('');
}

function updateTradingStats() {
  let totalBuyCount = 0;
  let totalSellCount = 0;
  let tradingDays = 0;
  
  DAYS.forEach(day => {
    if (day.status !== 'open') return;
    
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
    if (day.status !== 'open') return;
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
  
  const openDays = DAYS.filter(d => d.status === 'open');
  
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
  updateDividendHistory();
  updateDividendSummary();
}

function updateTodayDividend() {
  const container = $('#todayDividend');
  const today = todayStr();
  const todayDay = DAYS.find(d => d.date === today && d.status === 'open');
  
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
    .filter(d => d.status === 'open')
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
    if (day.status !== 'open') return;
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
        status: day.status || 'open',
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

// ===== Import Paste Sheet =====
function openImportPasteSheet() {
  $('#importPasteText').value = '';
  $('#importPasteSheet').setAttribute('aria-hidden', 'false');
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
  
  try {
    await importDataFromText(text);
    alert('导入成功！');
    closeImportPasteSheet();
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
  
  // Analysis button
  $('#btnAnalysis').addEventListener('click', openAnalysisPage);
  $('#btnBackFromAnalysis').addEventListener('click', closeAnalysisPage);
  
  // Dividend button
  $('#btnDividend').addEventListener('click', openDividendPage);
  $('#btnBackFromDividend').addEventListener('click', closeDividendPage);
  
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
  
  // Status selection
  $$('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setStatusSelection(btn.dataset.status);
    });
  });
  
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
    
    // Filter valid trades
    const validTrades = status === 'open' 
      ? tradeEntries.filter(t => t.symbol && t.quantity && t.price)
      : [];
    
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
  $('#btnExportCopy').addEventListener('click', exportDataToClipboard);
  
  // Import
  $('#fileImport').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      importData(file);
      e.target.value = '';
    }
  });
  
  $('#btnImportPaste').addEventListener('click', openImportPasteSheet);
  $('#btnCloseImportPaste').addEventListener('click', closeImportPasteSheet);
  $('#btnCancelImportPaste').addEventListener('click', closeImportPasteSheet);
  $('#importPasteBackdrop').addEventListener('click', closeImportPasteSheet);
  $('#btnConfirmImportPaste').addEventListener('click', confirmImportPaste);
  
  // Clear all
  $('#btnClearAll').addEventListener('click', async () => {
    if (confirm('确定要清空所有数据吗？此操作不可撤销！')) {
      await clearAllDays();
      closeSettings();
      await refresh();
    }
  });
  
  // Theme change listener
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  
  const onThemeChange = () => {
    if (profitChart) {
      profitChart.destroy();
      initChart();
      updateChart($('.chart-tab.active')?.dataset.range || 'week');
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

// ===== Initialize =====
async function init() {
  await loadCompanyData();
  initChart();
  bindEvents();
  await refresh();
}

// Start the app
init();
