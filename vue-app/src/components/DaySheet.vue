<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { getCompanyName, hasCompany } from '@/services/company'
import { formatMoney, todayStr } from '@/utils/format'
import type { Trade, MarketStatus } from '@/types'

const store = useAppStore()

const date = ref('')
const status = ref<MarketStatus | ''>('')
const trades = ref<Trade[]>([{ symbol: '', profit: '' }])

const isEditing = computed(() => !!store.editingDay)
const title = computed(() => isEditing.value ? '编辑记录' : '添加记录')

const dailyTotal = computed(() => {
  return trades.value.reduce((sum, t) => sum + (Number(t.profit) || 0), 0)
})

const dailyTotalClass = computed(() => {
  if (dailyTotal.value > 0) return 'positive'
  if (dailyTotal.value < 0) return 'negative'
  return ''
})

// 初始化表单
watch(() => store.daySheetOpen, (open) => {
  if (open) {
    if (store.editingDay) {
      date.value = store.editingDay.date
      status.value = store.editingDay.status
      trades.value = store.editingDay.trades?.length 
        ? store.editingDay.trades.map(t => ({ ...t }))
        : [{ symbol: '', profit: '' }]
    } else {
      date.value = todayStr()
      status.value = ''
      trades.value = [{ symbol: '', profit: '' }]
    }
  }
})

function setStatus(s: MarketStatus) {
  status.value = s
  if (s === 'open' && trades.value.length === 0) {
    trades.value = [{ symbol: '', profit: '' }]
  }
}

function addTrade() {
  trades.value.push({ symbol: '', profit: '' })
}

function removeTrade(index: number) {
  if (trades.value.length > 1) {
    trades.value.splice(index, 1)
  }
}

function getCompanyHint(symbol: string) {
  if (!symbol) return ''
  const name = getCompanyName(symbol)
  return name !== symbol ? name : ''
}

async function handleSubmit() {
  if (!date.value) {
    alert('请选择日期')
    return
  }
  if (!status.value) {
    alert('请选择市场状态')
    return
  }

  try {
    if (isEditing.value && store.editingDay) {
      await store.updateDay(store.editingDay.id, date.value, status.value, trades.value)
    } else {
      await store.addDay(date.value, status.value, trades.value)
    }
    store.closeDaySheet()
  } catch (err) {
    alert((err as Error).message || '保存失败')
  }
}

async function handleDelete() {
  if (!store.editingDay) return
  if (confirm('确定要删除这条记录吗？')) {
    await store.removeDay(store.editingDay.id)
    store.closeDaySheet()
  }
}
</script>

<template>
  <div class="sheet" :aria-hidden="!store.daySheetOpen">
    <div class="sheet-backdrop" @click="store.closeDaySheet()"></div>
    <div class="sheet-panel">
      <div class="sheet-header">
        <div>
          <h3 class="sheet-title">{{ title }}</h3>
          <p class="sheet-subtitle">选择日期和市场状态</p>
        </div>
        <button class="icon-btn small" @click="store.closeDaySheet()">✕</button>
      </div>

      <form class="day-form" @submit.prevent="handleSubmit">
        <!-- Date Selection -->
        <div class="form-group">
          <label class="form-label">日期</label>
          <input type="date" v-model="date" class="form-input date-input" />
        </div>

        <!-- Market Status -->
        <div class="form-group">
          <label class="form-label">市场状态</label>
          <div class="status-selector">
            <button 
              type="button" 
              class="status-btn" 
              :class="{ active: status === 'open' }"
              data-status="open"
              @click="setStatus('open')"
            >
              <span class="status-icon">📈</span>
              <span>开盘</span>
            </button>
            <button 
              type="button" 
              class="status-btn" 
              :class="{ active: status === 'holiday' }"
              data-status="holiday"
              @click="setStatus('holiday')"
            >
              <span class="status-icon">🎌</span>
              <span>祝日</span>
            </button>
            <button 
              type="button" 
              class="status-btn" 
              :class="{ active: status === 'closed' }"
              data-status="closed"
              @click="setStatus('closed')"
            >
              <span class="status-icon">🌙</span>
              <span>休日</span>
            </button>
          </div>
        </div>

        <!-- Trades Section -->
        <div v-if="status === 'open'" class="trades-section">
          <div class="form-group">
            <label class="form-label">交易明细</label>
            <div class="trades-list-form">
              <div 
                v-for="(trade, index) in trades" 
                :key="index"
                class="trade-entry"
              >
                <div class="trade-input-group">
                  <input 
                    type="text" 
                    class="form-input symbol-input" 
                    placeholder="股票代码"
                    v-model="trade.symbol"
                  />
                  <div 
                    class="company-name-hint"
                    :class="{ visible: getCompanyHint(trade.symbol) }"
                  >
                    {{ getCompanyHint(trade.symbol) }}
                  </div>
                </div>
                <input 
                  type="number" 
                  class="form-input profit-input" 
                  placeholder="损益 (¥)"
                  v-model="trade.profit"
                  step="0.01"
                />
                <button 
                  type="button" 
                  class="remove-trade-btn"
                  :style="{ visibility: trades.length <= 1 ? 'hidden' : 'visible' }"
                  @click="removeTrade(index)"
                >×</button>
              </div>
            </div>
            <button type="button" class="add-trade-btn" @click="addTrade">
              <span>+ 添加股票</span>
            </button>
          </div>

          <!-- Daily Summary -->
          <div class="daily-summary">
            <div class="summary-row">
              <span>今日总损益</span>
              <span :class="['daily-total', dailyTotalClass]">{{ formatMoney(dailyTotal) }}</span>
            </div>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="form-actions">
          <button 
            v-if="isEditing"
            type="button" 
            class="btn danger" 
            @click="handleDelete"
          >删除</button>
          <div class="spacer"></div>
          <button type="button" class="btn secondary" @click="store.closeDaySheet()">取消</button>
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

