import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DayRecord, Trade, MarketStatus, ChartRange, StockStats, ExportData } from '@/types'
import { getAllDays, saveDay, deleteDay, clearAllDays, getDayByDate } from '@/services/database'
import { getStockDisplayName } from '@/services/company'
import { generateId, todayStr, getMonthKey } from '@/utils/format'

export const useAppStore = defineStore('app', () => {
  // State
  const days = ref<DayRecord[]>([])
  const currentPage = ref(1)
  const currentFilter = ref('all')
  const chartRange = ref<ChartRange>('week')
  const dividendRatio = ref(3)
  const isLoading = ref(false)

  // 当前页面
  const currentView = ref<'main' | 'analysis' | 'dividend'>('main')

  // Sheet 状态
  const daySheetOpen = ref(false)
  const settingsSheetOpen = ref(false)
  const importPasteSheetOpen = ref(false)
  const editingDay = ref<DayRecord | null>(null)

  // Constants
  const RECORDS_PER_PAGE = 7

  // Computed
  const openDays = computed(() => days.value.filter(d => d.status === 'open'))

  const totalProfit = computed(() => {
    return openDays.value.reduce((sum, day) => {
      const dayProfit = day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
      return sum + dayProfit
    }, 0)
  })

  const tradeDays = computed(() => openDays.value.length)

  const winDays = computed(() => {
    return openDays.value.filter(day => {
      const profit = day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
      return profit > 0
    }).length
  })

  const lossDays = computed(() => {
    return openDays.value.filter(day => {
      const profit = day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
      return profit < 0
    }).length
  })

  const winRate = computed(() => {
    return tradeDays.value > 0 ? Math.round((winDays.value / tradeDays.value) * 100) : 0
  })

  const stockCount = computed(() => {
    const stockSet = new Set<string>()
    openDays.value.forEach(day => {
      day.trades?.forEach(t => {
        if (t.symbol) stockSet.add(t.symbol.toUpperCase())
      })
    })
    return stockSet.size
  })

  // 月份列表
  const monthOptions = computed(() => {
    const months = new Set<string>()
    days.value.forEach(d => {
      months.add(getMonthKey(d.date))
    })
    return Array.from(months).sort().reverse()
  })

  // 筛选后的记录
  const filteredDays = computed(() => {
    if (currentFilter.value === 'all') {
      return days.value
    }
    return days.value.filter(d => getMonthKey(d.date) === currentFilter.value)
  })

  // 分页后的记录
  const paginatedDays = computed(() => {
    const totalPages = Math.ceil(filteredDays.value.length / RECORDS_PER_PAGE)
    if (currentPage.value > totalPages) currentPage.value = Math.max(1, totalPages)

    const start = (currentPage.value - 1) * RECORDS_PER_PAGE
    return filteredDays.value.slice(start, start + RECORDS_PER_PAGE)
  })

  const totalPages = computed(() => Math.ceil(filteredDays.value.length / RECORDS_PER_PAGE))

  // 股票排行
  const stockRanking = computed((): StockStats[] => {
    const stockMap = new Map<string, StockStats>()

    days.value.forEach(day => {
      if (day.status !== 'open') return
      day.trades?.forEach(t => {
        if (!t.symbol) return
        const symbol = t.symbol.toUpperCase()
        const profit = Number(t.profit) || 0

        if (!stockMap.has(symbol)) {
          stockMap.set(symbol, { symbol, profit: 0, tradeCount: 0 })
        }
        const stock = stockMap.get(symbol)!
        stock.profit += profit
        stock.tradeCount++
      })
    })

    return Array.from(stockMap.values()).sort((a, b) => b.profit - a.profit)
  })

  // 最佳/最差交易日
  const bestDay = computed(() => {
    const daysWithProfit = openDays.value.map(day => ({
      ...day,
      totalProfit: day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
    }))
    const sorted = daysWithProfit.sort((a, b) => b.totalProfit - a.totalProfit)
    return sorted[0]?.totalProfit > 0 ? sorted[0] : null
  })

  const worstDay = computed(() => {
    const daysWithProfit = openDays.value.map(day => ({
      ...day,
      totalProfit: day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
    }))
    const sorted = daysWithProfit.sort((a, b) => a.totalProfit - b.totalProfit)
    return sorted[0]?.totalProfit < 0 ? sorted[0] : null
  })

  // 分红计算
  function calculateDividend(profit: number): number {
    const ratio = 1 / dividendRatio.value
    if (profit >= 0) {
      return Math.ceil(profit * ratio * 0.8)
    } else {
      return Math.floor(profit * ratio)
    }
  }

  const todayDividend = computed(() => {
    const today = todayStr()
    const todayDay = days.value.find(d => d.date === today && d.status === 'open')
    if (!todayDay) return null

    const profit = todayDay.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
    return {
      date: today,
      profit,
      dividend: calculateDividend(profit)
    }
  })

  const dividendHistory = computed(() => {
    return openDays.value
      .map(day => {
        const profit = day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
        return { ...day, profit, dividend: calculateDividend(profit) }
      })
      .filter(d => d.profit !== 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)
  })

  const totalDividend = computed(() => {
    let total = 0
    openDays.value.forEach(day => {
      const profit = day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
      const dividend = calculateDividend(profit)
      if (dividend >= 0) total += dividend
    })
    return total
  })

  const totalLossShare = computed(() => {
    let total = 0
    openDays.value.forEach(day => {
      const profit = day.trades?.reduce((s, t) => s + (Number(t.profit) || 0), 0) || 0
      const dividend = calculateDividend(profit)
      if (dividend < 0) total += Math.abs(dividend)
    })
    return total
  })

  const netDividend = computed(() => totalDividend.value - totalLossShare.value)

  // Actions
  async function loadDays() {
    isLoading.value = true
    try {
      days.value = await getAllDays()
    } finally {
      isLoading.value = false
    }
  }

  async function addDay(date: string, status: MarketStatus, trades: Trade[]) {
    const existing = await getDayByDate(date)
    if (existing) {
      throw new Error('该日期已有记录，请编辑现有记录')
    }

    const day: DayRecord = {
      id: generateId(),
      date,
      status,
      trades: status === 'open' ? trades.filter(t => t.symbol || t.profit) : [],
      updatedAt: new Date().toISOString()
    }

    await saveDay(day)
    await loadDays()
  }

  async function updateDay(id: string, date: string, status: MarketStatus, trades: Trade[]) {
    const day: DayRecord = {
      id,
      date,
      status,
      trades: status === 'open' ? trades.filter(t => t.symbol || t.profit) : [],
      updatedAt: new Date().toISOString()
    }

    await saveDay(day)
    await loadDays()
  }

  async function removeDay(id: string) {
    await deleteDay(id)
    await loadDays()
  }

  async function clearAll() {
    await clearAllDays()
    await loadDays()
  }

  function setFilter(filter: string) {
    currentFilter.value = filter
    currentPage.value = 1
  }

  function setPage(page: number) {
    currentPage.value = page
  }

  function nextPage() {
    if (currentPage.value < totalPages.value) {
      currentPage.value++
    }
  }

  function prevPage() {
    if (currentPage.value > 1) {
      currentPage.value--
    }
  }

  function openDaySheet(day?: DayRecord) {
    editingDay.value = day || null
    daySheetOpen.value = true
  }

  function closeDaySheet() {
    daySheetOpen.value = false
    editingDay.value = null
  }

  function getExportData(): ExportData {
    return {
      exportedAt: new Date().toISOString(),
      version: '3.0',
      days: days.value
    }
  }

  async function importData(data: ExportData | DayRecord[]) {
    const daysToImport = Array.isArray(data) ? data : (data.days || [])

    if (!Array.isArray(daysToImport) || daysToImport.length === 0) {
      throw new Error('没有找到有效数据')
    }

    for (const day of daysToImport) {
      if (!day || !day.id) continue
      await saveDay({
        id: day.id,
        date: day.date,
        status: day.status || 'open',
        trades: day.trades || [],
        updatedAt: new Date().toISOString()
      })
    }

    await loadDays()
  }

  return {
    // State
    days,
    currentPage,
    currentFilter,
    chartRange,
    dividendRatio,
    isLoading,
    currentView,
    daySheetOpen,
    settingsSheetOpen,
    importPasteSheetOpen,
    editingDay,

    // Computed
    openDays,
    totalProfit,
    tradeDays,
    winDays,
    lossDays,
    winRate,
    stockCount,
    monthOptions,
    filteredDays,
    paginatedDays,
    totalPages,
    stockRanking,
    bestDay,
    worstDay,
    todayDividend,
    dividendHistory,
    totalDividend,
    totalLossShare,
    netDividend,

    // Actions
    loadDays,
    addDay,
    updateDay,
    removeDay,
    clearAll,
    setFilter,
    setPage,
    nextPage,
    prevPage,
    openDaySheet,
    closeDaySheet,
    calculateDividend,
    getExportData,
    importData
  }
})

