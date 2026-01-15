<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { formatMoney, formatMoneyShort, formatDate } from '@/utils/format'

const store = useAppStore()

const ratioPreview = computed(() => {
  const ratio = 1 / store.dividendRatio
  return (ratio * 100).toFixed(2) + '%'
})

function getDividendClass(dividend: number) {
  if (dividend > 0) return 'positive'
  if (dividend < 0) return 'negative'
  return 'zero'
}
</script>

<template>
  <div class="app dividend-page">
    <header class="header">
      <div class="header-content">
        <button class="back-btn" @click="store.currentView = 'main'">
          <span>←</span>
          <span>返回</span>
        </button>
        <div class="title-group center">
          <h1>股东分红</h1>
        </div>
        <div class="header-spacer"></div>
      </div>
    </header>

    <main class="main">
      <!-- Dividend Settings -->
      <section class="card dividend-settings-card">
        <div class="card-header">
          <h2>⚙️ 分红设置</h2>
        </div>
        <div class="dividend-ratio-setting">
          <div class="ratio-label">分红比例</div>
          <div class="ratio-input-group">
            <span class="ratio-text">1 /</span>
            <input 
              type="number" 
              class="ratio-input" 
              :value="store.dividendRatio"
              min="1" 
              step="1"
              @input="store.dividendRatio = parseInt(($event.target as HTMLInputElement).value) || 3"
            />
          </div>
          <div class="ratio-preview">
            当前比例：<span>{{ ratioPreview }}</span>
          </div>
        </div>
        <div class="dividend-rules">
          <div class="rule-item profit">
            <span class="rule-icon">📈</span>
            <span>盈利分红 = 收益 × 分红率 × 80%（扣税）</span>
          </div>
          <div class="rule-item loss">
            <span class="rule-icon">📉</span>
            <span>亏损分担 = 亏损 × 分红率 × 100%</span>
          </div>
        </div>
      </section>

      <!-- Today's Dividend -->
      <section class="card">
        <div class="card-header">
          <h2>🎁 今日分红</h2>
        </div>
        <div class="today-dividend">
          <div v-if="!store.todayDividend" class="dividend-empty">
            <div class="empty-icon">📅</div>
            <div class="empty-title">今日暂无交易记录</div>
          </div>
          <div v-else class="dividend-today-card">
            <div class="dividend-today-date">
              {{ formatDate(store.todayDividend.date).year }}年{{ formatDate(store.todayDividend.date).month }}{{ formatDate(store.todayDividend.date).day }}日
            </div>
            <div class="dividend-today-profit">今日收益: {{ formatMoney(store.todayDividend.profit) }}</div>
            <div :class="['dividend-today-amount', getDividendClass(store.todayDividend.dividend)]">
              {{ formatMoney(store.todayDividend.dividend) }}
            </div>
          </div>
        </div>
      </section>

      <!-- Dividend History -->
      <section class="card">
        <div class="card-header">
          <h2>📜 分红历史</h2>
        </div>
        <div class="dividend-history">
          <div v-if="store.dividendHistory.length === 0" class="empty-state">
            <div class="empty-icon">🎁</div>
            <div class="empty-title">暂无分红记录</div>
          </div>
          <div 
            v-for="day in store.dividendHistory" 
            :key="day.id"
            class="dividend-history-item"
          >
            <div>
              <div class="dividend-history-date">{{ formatDate(day.date).month }}{{ formatDate(day.date).day }}日</div>
              <div class="dividend-history-profit">收益: {{ formatMoney(day.profit) }}</div>
            </div>
            <div :class="['dividend-history-amount', day.dividend >= 0 ? 'positive' : 'negative']">
              {{ formatMoney(day.dividend) }}
            </div>
          </div>
        </div>
      </section>

      <!-- Dividend Summary -->
      <section class="card">
        <div class="card-header">
          <h2>📊 分红汇总</h2>
        </div>
        <div class="dividend-summary-stats">
          <div class="dividend-stat">
            <span class="dividend-stat-label">累计分红</span>
            <span class="dividend-stat-value">{{ formatMoneyShort(store.totalDividend) }}</span>
          </div>
          <div class="dividend-stat">
            <span class="dividend-stat-label">累计分担亏损</span>
            <span class="dividend-stat-value loss">{{ formatMoneyShort(store.totalLossShare) }}</span>
          </div>
          <div class="dividend-stat highlight">
            <span class="dividend-stat-label">净分红</span>
            <span 
              class="dividend-stat-value"
              :style="{ color: store.netDividend >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }"
            >{{ formatMoney(store.netDividend) }}</span>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

