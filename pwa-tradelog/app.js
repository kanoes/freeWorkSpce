// ===== Service Worker =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtDate = (d) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

const safeUpper = (s) => (s || "").trim().toUpperCase();

const num = (s) => {
  const v = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(v) ? v : NaN;
};

const nowLabel = () => {
  const dt = new Date();
  return dt.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const downloadText = (filename, text, mime = "application/json") => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ===== IndexedDB =====
const DB_NAME = "tradelog_db";
const DB_VER = 1;
const STORE = "trades";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("tradeDate", "tradeDate", { unique: false });
      store.createIndex("symbol", "symbol", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbTx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const res = fn(store);
    tx.oncomplete = () => resolve(res);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllTrades() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("tradeDate");
    const req = idx.openCursor(null, "prev"); // newest first
    const out = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out.push(cur.value); cur.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

async function upsertTrade(trade) {
  return dbTx("readwrite", (store) => store.put(trade));
}

async function deleteTrade(id) {
  return dbTx("readwrite", (store) => store.delete(id));
}

async function clearAll() {
  return dbTx("readwrite", (store) => store.clear());
}

// ===== App State =====
let TRADES = [];
let FILTER = "";

function computeHoldings(trades) {
  // 简化：按 symbol 汇总净数量；均价=买入加权均价（SELL 不影响买入均价，仅影响净数量）
  const map = new Map();
  for (const t of trades) {
    const s = safeUpper(t.symbol);
    if (!s) continue;
    if (!map.has(s)) map.set(s, { symbol: s, netQty: 0, buyQty: 0, buyCost: 0 });
    const row = map.get(s);
    const q = Number(t.quantity) || 0;
    const p = Number(t.price) || 0;

    if (t.side === "BUY") {
      row.netQty += q;
      row.buyQty += q;
      row.buyCost += q * p;
    } else {
      row.netQty -= q;
    }
  }
  const arr = Array.from(map.values()).map(r => ({
    symbol: r.symbol,
    netQty: r.netQty,
    avgCost: r.buyQty > 0 ? (r.buyCost / r.buyQty) : 0
  }));
  // 排序：净持仓绝对值大在前
  arr.sort((a,b) => Math.abs(b.netQty) - Math.abs(a.netQty));
  return arr;
}

function updateOverview() {
  $("#chipTrades").textContent = `${TRADES.length} 笔交易`;
  $("#chipUpdated").textContent = `更新：${nowLabel()}`;

  const holdings = computeHoldings(TRADES);
  const nonZero = holdings.filter(h => Math.abs(h.netQty) > 1e-9);
  $("#statSymbols").textContent = String(nonZero.length);

  const totalNet = nonZero.reduce((acc, h) => acc + h.netQty, 0);
  $("#statNetQty").textContent = (Math.round(totalNet * 100) / 100).toString();
}

function renderHoldings() {
  const wrapEmpty = $("#holdingsEmpty");
  const table = $("#holdingsTable");

  const holdings = computeHoldings(TRADES);
  const rows = holdings.filter(h => Math.abs(h.netQty) > 1e-9);

  if (rows.length === 0) {
    wrapEmpty.hidden = false;
    table.hidden = true;
    table.innerHTML = "";
    return;
  }

  wrapEmpty.hidden = true;
  table.hidden = false;

  table.innerHTML = rows.map(h => {
    const badgeClass = h.netQty > 0 ? "ok" : (h.netQty < 0 ? "danger" : "warn");
    const badgeText = h.netQty > 0 ? "多" : (h.netQty < 0 ? "空" : "平");
    return `
      <div class="hrow">
        <div class="hleft">
          <div class="sym">${h.symbol}</div>
          <div class="meta">买入均价：${h.avgCost.toFixed(2)}</div>
        </div>
        <div class="hright">
          <div class="badge ${badgeClass}">${badgeText}</div>
          <div class="meta">净数量：${(Math.round(h.netQty * 100) / 100).toString()}</div>
        </div>
      </div>
    `;
  }).join("");
}

function matchesFilter(t, f) {
  if (!f) return true;
  const s = safeUpper(f);
  return safeUpper(t.symbol).includes(s) || (t.note || "").toLowerCase().includes(f.toLowerCase());
}

function renderTrades() {
  const list = $("#tradesList");
  const empty = $("#tradesEmpty");

  const filtered = TRADES.filter(t => matchesFilter(t, FILTER));
  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = filtered.map(t => {
    const sideClass = t.side === "BUY" ? "buy" : "sell";
    const sideText = t.side === "BUY" ? "买入" : "卖出";
    const total = (Number(t.quantity) || 0) * (Number(t.price) || 0);
    const note = (t.note || "").trim();
    return `
      <div class="item" data-id="${t.id}">
        <div class="pill ${sideClass}">${sideText}</div>
        <div class="itemMain">
          <div class="itemTop">
            <div class="code">${safeUpper(t.symbol)}</div>
            <div class="amt">${total.toFixed(2)}</div>
          </div>
          <div class="itemSub">
            <span>${fmtDate(t.tradeDate)}</span>
            <span>${Number(t.quantity).toFixed(2)} @ ${Number(t.price).toFixed(2)}</span>
          </div>
          ${note ? `<div class="itemNote">${escapeHtml(note)}</div>` : ``}
        </div>
        <div class="itemBtns">
          <button class="smallBtn" data-act="edit">编辑</button>
        </div>
      </div>
    `;
  }).join("");

  // bind edit
  $$(".item [data-act='edit']").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.closest(".item").dataset.id;
      const t = TRADES.find(x => x.id === id);
      if (t) openSheet("edit", t);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[ch]));
}

async function refresh() {
  TRADES = await getAllTrades();
  updateOverview();
  renderHoldings();
  renderTrades();
}

// ===== Sheet (Add/Edit) =====
const sheet = $("#sheet");
const sheetBackdrop = $("#sheetBackdrop");

function showSheet() {
  sheet.classList.add("show");
  sheet.setAttribute("aria-hidden", "false");
}
function hideSheet() {
  sheet.classList.remove("show");
  sheet.setAttribute("aria-hidden", "true");
  $("#formError").hidden = true;
}

function setSeg(side) {
  $("#fSide").value = side;
  $$(".segBtn").forEach(b => b.classList.toggle("active", b.dataset.side === side));
}

function openSheet(mode, trade = null) {
  $("#formError").hidden = true;

  if (mode === "add") {
    $("#sheetTitle").textContent = "新增交易";
    $("#btnDelete").hidden = true;

    $("#fId").value = "";
    $("#fSymbol").value = "";
    $("#fQty").value = "";
    $("#fPrice").value = "";
    $("#fNote").value = "";
    $("#fDate").value = fmtDate(new Date());
    setSeg("BUY");
  } else {
    $("#sheetTitle").textContent = "编辑交易";
    $("#btnDelete").hidden = false;

    $("#fId").value = trade.id;
    $("#fSymbol").value = trade.symbol;
    $("#fQty").value = String(trade.quantity);
    $("#fPrice").value = String(trade.price);
    $("#fNote").value = trade.note || "";
    $("#fDate").value = fmtDate(trade.tradeDate);
    setSeg(trade.side || "BUY");
  }

  showSheet();
  setTimeout(() => $("#fSymbol").focus(), 60);
}

function formError(msg) {
  const el = $("#formError");
  el.textContent = msg;
  el.hidden = false;
}

$("#btnAdd").addEventListener("click", () => openSheet("add"));
$("#btnClose").addEventListener("click", hideSheet);
$("#btnCancel").addEventListener("click", hideSheet);
sheetBackdrop.addEventListener("click", hideSheet);

$$(".segBtn").forEach(b => {
  b.addEventListener("click", () => setSeg(b.dataset.side));
});

$("#tradeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#formError").hidden = true;

  const id = $("#fId").value || crypto.randomUUID();
  const symbol = safeUpper($("#fSymbol").value);
  const side = $("#fSide").value || "BUY";
  const quantity = num($("#fQty").value);
  const price = num($("#fPrice").value);
  const tradeDate = $("#fDate").value ? new Date($("#fDate").value).toISOString() : new Date().toISOString();
  const note = ($("#fNote").value || "").trim();

  if (!symbol) return formError("请输入股票代码。");
  if (!Number.isFinite(quantity) || quantity <= 0) return formError("数量必须是大于 0 的数字。");
  if (!Number.isFinite(price) || price <= 0) return formError("价格必须是大于 0 的数字。");

  await upsertTrade({ id, symbol, side, quantity, price, tradeDate, note, updatedAt: new Date().toISOString() });
  hideSheet();
  await refresh();
});

$("#btnDelete").addEventListener("click", async () => {
  const id = $("#fId").value;
  if (!id) return;
  const ok = confirm("确定删除这条交易吗？");
  if (!ok) return;
  await deleteTrade(id);
  hideSheet();
  await refresh();
});

// ===== Search =====
$("#search").addEventListener("input", (e) => {
  FILTER = e.target.value || "";
  renderTrades();
});

// ===== Settings Sheet =====
const settings = $("#settings");
function showSettings() {
  settings.classList.add("show");
  settings.setAttribute("aria-hidden", "false");
}
function hideSettings() {
  settings.classList.remove("show");
  settings.setAttribute("aria-hidden", "true");
}
$("#btnSettings").addEventListener("click", showSettings);
$("#btnSettingsClose").addEventListener("click", hideSettings);
$("#settingsBackdrop").addEventListener("click", hideSettings);

// ===== Export / Import / Wipe =====
function tradesToCSV(trades) {
  const header = ["id","symbol","side","quantity","price","tradeDate","note"].join(",");
  const lines = trades.map(t => [
    t.id,
    `"${safeUpper(t.symbol).replaceAll('"','""')}"`,
    t.side,
    t.quantity,
    t.price,
    fmtDate(t.tradeDate),
    `"${(t.note || "").replaceAll('"','""')}"`
  ].join(","));
  return [header, ...lines].join("\n");
}

$("#btnExportJSON").addEventListener("click", async () => {
  const data = await getAllTrades();
  downloadText(`tradelog-backup-${fmtDate(new Date())}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), trades: data }, null, 2));
});

$("#btnExportCSV").addEventListener("click", async () => {
  const data = await getAllTrades();
  downloadText(`tradelog-${fmtDate(new Date())}.csv`, tradesToCSV(data), "text/csv");
});

$("#btnWipe").addEventListener("click", async () => {
  const ok = confirm("确定要清空全部数据吗？此操作不可撤销。");
  if (!ok) return;
  await clearAll();
  hideSettings();
  await refresh();
});

$("#fileImport").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const trades = Array.isArray(json) ? json : (json.trades || []);
    if (!Array.isArray(trades)) throw new Error("格式不正确");

    // 合并导入：逐条 upsert（同 id 会覆盖）
    for (const t of trades) {
      if (!t || !t.id) continue;
      await upsertTrade({
        id: String(t.id),
        symbol: safeUpper(t.symbol),
        side: t.side === "SELL" ? "SELL" : "BUY",
        quantity: Number(t.quantity) || 0,
        price: Number(t.price) || 0,
        tradeDate: t.tradeDate ? new Date(t.tradeDate).toISOString() : new Date().toISOString(),
        note: (t.note || "").toString(),
        updatedAt: new Date().toISOString()
      });
    }

    alert("导入完成 ✅");
    hideSettings();
    await refresh();
  } catch (err) {
    alert("导入失败：" + (err?.message || err));
  } finally {
    e.target.value = "";
  }
});

// ===== Tabbar quick actions =====
$("#btnExport").addEventListener("click", () => {
  showSettings();
  // 轻微提示：用户更可能用导出 CSV/JSON
});
$("#btnImport").addEventListener("click", () => {
  showSettings();
});

// ===== Init =====
(async function init(){
  // default date
  $("#fDate").value = fmtDate(new Date());
  await refresh();
})();

