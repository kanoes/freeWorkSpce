<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useMonthlyChart } from '@/composables/useChart'
import { formatMoney, formatMoneyShort, formatDate } from '@/utils/format'
import { getStockDisplayName } from '@/services/company'

const store = useAppStore()
const monthlyChartCanvas = ref<HTMLCanvasElement | null>(null)

useMonthlyChart(monthlyChartCanvas, computed(() => store.days))

function getRankClass(index: number) {
  if (index === 0) return 'gold'
  if (index === 1) return 'silver'
  if (index === 2) return 'bronze'
  return ''
}
</script>

<template>
  <div class="app analysis-page">
    <header class="header">
      <div class="header-content">
        <button class="back-btn" @click="store.currentView = 'main'">
          <span>←</span>
          <span>返回</span>
        </button>
        <div class="title-group center">
          <h1>数据分析</h1>
        </div>
        <div class="header-spacer"></div>
      </div>
    </header>

    <main class="main">
      <!-- Analysis Summary -->
      <section class="analysis-summary">
        <div class="analysis-stat-card">
          <div class="analysis-stat-icon profit">💹</div>
          <div class="analysis-stat-info">
            <span class="analysis-stat-label">总收益</span>
            <span 
              class="analysis-stat-value" 
              :style="{ color: store.totalProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }"
            >{{ formatMoneyShort(store.totalProfit) }}</span>
          </div>
        </div>
        <div class="analysis-stat-card">
          <div class="analysis-stat-icon">📈</div>
          <div class="analysis-stat-info">
            <span class="analysis-stat-label">盈利天数</span>
            <span class="analysis-stat-value">{{ store.winDays }}</span>
          </div>
        </div>
        <div class="analysis-stat-card">
          <div class="analysis-stat-icon">📉</div>
          <div class="analysis-stat-info">
            <span class="analysis-stat-label">亏损天数</span>
            <span class="analysis-stat-value">{{ store.lossDays }}</span>
          </div>
        </div>
        <div class="analysis-stat-card">
          <div class="analysis-stat-icon">🏷️</div>
          <div class="analysis-stat-info">
            <span class="analysis-stat-label">交易股票数</span>
            <span class="analysis-stat-value">{{ store.stockCount }}</span>
          </div>
        </div>
      </section>

      <!-- Stock Ranking -->
      <section class="card">
        <div class="card-header">
          <h2>📊 股票损益排行</h2>
        </div>
        <div class="stock-ranking">
          <div v-if="store.stockRanking.length === 0" class="empty-state">
            <div class="empty-icon">📈</div>
            <div class="empty-title">暂无数据</div>
            <div class="empty-desc">开始记录交易后这里会显示排行</div>
          </div>
          <div 
            v-for="(stock, index) in store.stockRanking" 
            :key="stock.symbol"
            class="stock-rank-item"
          >
            <div :class="['rank-number', getRankClass(index)]">{{ index + 1 }}</div>
            <div class="stock-rank-info">
              <div class="stock-rank-symbol">{{ getStockDisplayName(stock.symbol) }}</div>
              <div class="stock-rank-trades">
                {{ getStockDisplayName(stock.symbol) !== stock.symbol ? `${stock.symbol} · ` : '' }}{{ stock.tradeCount }}次交易
              </div>
            </div>
            <div :class="['stock-rank-profit', stock.profit >= 0 ? 'positive' : 'negative']">
              {{ formatMoney(stock.profit) }}
            </div>
          </div>
        </div>
      </section>

      <!-- Monthly Breakdown -->
      <section class="card">
        <div class="card-header">
          <h2>📅 月度收益</h2>
        </div>
        <div class="monthly-chart-container">
          <canvas ref="monthlyChartCanvas"></canvas>
        </div>
      </section>

      <!-- Best/Worst Days -->
      <section class="card">
        <div class="card-header">
          <h2>🏆 最佳 & 最差交易日</h2>
        </div>
        <div class="best-worst-days">
          <div v-if="!store.bestDay && !store.worstDay" class="empty-state">
            <div class="empty-icon">📆</div>
            <div class="empty-title">暂无明显盈亏</div>
          </div>
          <div v-if="store.bestDay" class="day-highlight best">
            <div class="day-highlight-icon">🏆</div>
            <div class="day-highlight-info">
              <div class="day-highlight-label">最佳交易日</div>
              <div class="day-highlight-date">
                {{ formatDate(store.bestDay.date).year }}年{{ formatDate(store.bestDay.date).month }}{{ formatDate(store.bestDay.date).day }}日
              </div>
            </div>
            <div class="day-highlight-profit">{{ formatMoney(store.bestDay.totalProfit) }}</div>
          </div>
          <div v-if="store.worstDay" class="day-highlight worst">
            <div class="day-highlight-icon">📉</div>
            <div class="day-highlight-info">
              <div class="day-highlight-label">最差交易日</div>
              <div class="day-highlight-date">
                {{ formatDate(store.worstDay.date).year }}年{{ formatDate(store.worstDay.date).month }}{{ formatDate(store.worstDay.date).day }}日
              </div>
            </div>
            <div class="day-highlight-profit">{{ formatMoney(store.worstDay.totalProfit) }}</div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

