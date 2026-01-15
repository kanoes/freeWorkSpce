<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useProfitChart } from '@/composables/useChart'
import { formatMoney, formatMoneyShort, formatDate } from '@/utils/format'
import { getStockDisplayName } from '@/services/company'
import type { ChartRange } from '@/types'

const store = useAppStore()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
const chartRange = ref<ChartRange>('week')

useProfitChart(chartCanvas, computed(() => store.days), chartRange)

function setChartRange(range: ChartRange) {
  chartRange.value = range
}

function getStatusInfo(status: string) {
  switch (status) {
    case 'open': return { text: '开盘', icon: '📈', class: 'open' }
    case 'holiday': return { text: '祝日', icon: '🎌', class: 'holiday' }
    case 'closed': return { text: '休日', icon: '🌙', class: 'closed' }
    default: return { text: '', icon: '', class: '' }
  }
}

function getTradesInfo(day: typeof store.paginatedDays.value[0]) {
  if (day.status === 'open' && day.trades?.length > 0) {
    return day.trades
      .map(t => t.symbol ? getStockDisplayName(t.symbol) : null)
      .filter(Boolean)
      .join(', ') || '无交易'
  } else if (day.status === 'open') {
    return '无交易记录'
  }
  return getStatusInfo(day.status).text
}

function getDayProfit(day: typeof store.paginatedDays.value[0]) {
  if (day.status !== 'open') return null
  return day.trades?.reduce((sum, t) => sum + (Number(t.profit) || 0), 0) || 0
}

function getProfitClass(profit: number | null) {
  if (profit === null) return ''
  if (profit > 0) return 'positive'
  if (profit < 0) return 'negative'
  return 'zero'
}
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <div class="logo-section">
          <div class="logo">🍪</div>
          <div class="title-group">
            <h1>甜饼工坊</h1>
            <p>每日交易记录</p>
          </div>
        </div>
        <button class="icon-btn" @click="store.settingsSheetOpen = true" aria-label="设置">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path fill="currentColor" d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.64-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.25-.09-.52 0-.64.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.64.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.25.08.52 0 .64-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main">
      <!-- Summary Cards -->
      <section class="summary-section">
        <div class="summary-card highlight">
          <div class="summary-icon">💰</div>
          <div class="summary-info">
            <span class="summary-label">总收益</span>
            <span class="summary-value">{{ formatMoneyShort(store.totalProfit) }}</span>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">📊</div>
          <div class="summary-info">
            <span class="summary-label">交易天数</span>
            <span class="summary-value">{{ store.tradeDays }}天</span>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">🎯</div>
          <div class="summary-info">
            <span class="summary-label">胜率</span>
            <span class="summary-value">{{ store.winRate }}%</span>
          </div>
        </div>
      </section>

      <!-- Chart Section -->
      <section class="card chart-card">
        <div class="card-header">
          <h2>收益趋势</h2>
          <div class="chart-tabs">
            <button 
              class="chart-tab" 
              :class="{ active: chartRange === 'week' }"
              @click="setChartRange('week')"
            >周</button>
            <button 
              class="chart-tab" 
              :class="{ active: chartRange === 'month' }"
              @click="setChartRange('month')"
            >月</button>
            <button 
              class="chart-tab" 
              :class="{ active: chartRange === 'all' }"
              @click="setChartRange('all')"
            >全部</button>
          </div>
        </div>
        <div class="chart-container">
          <canvas ref="chartCanvas"></canvas>
        </div>
      </section>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button class="add-day-btn" @click="store.openDaySheet()">
          <span class="add-icon">+</span>
          <span>添加记录</span>
        </button>
        <button class="feature-btn" @click="store.currentView = 'dividend'">
          <span class="feature-icon">🎁</span>
          <span>股东分红</span>
        </button>
        <button class="feature-btn" @click="store.currentView = 'analysis'">
          <span class="feature-icon">📊</span>
          <span>数据分析</span>
        </button>
      </div>

      <!-- Records List -->
      <section class="card records-card">
        <div class="card-header">
          <h2>交易记录</h2>
          <div class="filter-group">
            <select 
              class="month-select" 
              :value="store.currentFilter"
              @change="store.setFilter(($event.target as HTMLSelectElement).value)"
            >
              <option value="all">全部</option>
              <option 
                v-for="month in store.monthOptions" 
                :key="month" 
                :value="month"
              >
                {{ month.split('-')[0] }}年{{ parseInt(month.split('-')[1]) }}月
              </option>
            </select>
          </div>
        </div>
        <div class="records-container">
          <div class="records-list">
            <div 
              v-if="store.filteredDays.length === 0" 
              class="empty-state"
            >
              <div class="empty-icon">📝</div>
              <div class="empty-title">还没有记录</div>
              <div class="empty-desc">点击上方按钮开始记录你的第一天</div>
            </div>
            <div 
              v-for="day in store.paginatedDays" 
              :key="day.id"
              class="record-item"
              @click="store.openDaySheet(day)"
            >
              <div class="record-date">
                <div class="day">{{ formatDate(day.date).day }}</div>
                <div class="month">{{ formatDate(day.date).month }}</div>
              </div>
              <div class="record-info">
                <div :class="['record-status', getStatusInfo(day.status).class]">
                  <span>{{ getStatusInfo(day.status).icon }}</span>
                  <span>{{ getStatusInfo(day.status).text }}</span>
                </div>
                <div class="record-trades">{{ getTradesInfo(day) }}</div>
              </div>
              <div 
                v-if="day.status === 'open'"
                :class="['record-profit', getProfitClass(getDayProfit(day))]"
              >
                {{ formatMoney(getDayProfit(day) || 0) }}
              </div>
            </div>
          </div>
          <div 
            v-if="store.totalPages > 1" 
            class="records-pagination"
          >
            <button 
              class="pagination-btn" 
              :disabled="store.currentPage <= 1"
              @click="store.prevPage()"
            >‹ 上一页</button>
            <span class="pagination-info">{{ store.currentPage }} / {{ store.totalPages }}</span>
            <button 
              class="pagination-btn" 
              :disabled="store.currentPage >= store.totalPages"
              @click="store.nextPage()"
            >下一页 ›</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

