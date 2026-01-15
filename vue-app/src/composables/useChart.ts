import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { Chart, registerables } from 'chart.js'
import type { ChartRange, DayRecord } from '@/types'
import { formatDate, formatMoneyShort } from '@/utils/format'

Chart.register(...registerables)

export function useProfitChart(
  canvasRef: Ref<HTMLCanvasElement | null>,
  days: Ref<DayRecord[]>,
  range: Ref<ChartRange>
) {
  let chart: Chart | null = null

  const isDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)

  const chartData = computed(() => {
    const openDays = days.value
      .filter(d => d.status === 'open')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let filteredDays = openDays
    const now = new Date()

    if (range.value === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filteredDays = openDays.filter(d => new Date(d.date) >= weekAgo)
    } else if (range.value === 'month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      filteredDays = openDays.filter(d => new Date(d.date) >= monthAgo)
    }

    let cumulative = 0
    const labels: string[] = []
    const data: number[] = []

    filteredDays.forEach(day => {
      const profit = day.trades?.reduce((sum, t) => sum + (Number(t.profit) || 0), 0) || 0
      cumulative += profit
      const dateInfo = formatDate(day.date)
      labels.push(`${dateInfo.month}${dateInfo.day}日`)
      data.push(cumulative)
    })

    return { labels, data, cumulative }
  })

  function createChart() {
    if (!canvasRef.value) return

    const ctx = canvasRef.value.getContext('2d')
    if (!ctx) return

    const gridColor = isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'
    const textColor = isDark.value ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.value.labels,
        datasets: [{
          label: '累计收益',
          data: chartData.value.data,
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
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark.value ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark.value ? '#f9fafb' : '#0f172a',
            bodyColor: isDark.value ? '#f9fafb' : '#0f172a',
            borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              title: (items) => items[0]?.label || '',
              label: (item) => `累计: ${formatMoneyShort(item.raw as number)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 }, maxRotation: 0 }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 11 },
              callback: (value) => `¥${value}`
            }
          }
        }
      }
    })
  }

  function updateChart() {
    if (!chart || !canvasRef.value) return

    const ctx = canvasRef.value.getContext('2d')
    if (!ctx) return

    chart.data.labels = chartData.value.labels
    chart.data.datasets[0].data = chartData.value.data

    const gradient = ctx.createLinearGradient(0, 0, 0, 200)
    if (chartData.value.cumulative >= 0) {
      gradient.addColorStop(0, 'rgba(52, 211, 153, 0.3)')
      gradient.addColorStop(1, 'rgba(52, 211, 153, 0)')
      chart.data.datasets[0].borderColor = '#34d399'
    } else {
      gradient.addColorStop(0, 'rgba(248, 113, 113, 0.3)')
      gradient.addColorStop(1, 'rgba(248, 113, 113, 0)')
      chart.data.datasets[0].borderColor = '#f87171'
    }
    chart.data.datasets[0].backgroundColor = gradient

    chart.update()
  }

  function destroyChart() {
    if (chart) {
      chart.destroy()
      chart = null
    }
  }

  // 监听主题变化
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleThemeChange = (e: MediaQueryListEvent) => {
    isDark.value = e.matches
    destroyChart()
    createChart()
    updateChart()
  }

  watch([chartData, range], () => {
    if (chart) {
      updateChart()
    }
  })

  onMounted(() => {
    createChart()
    updateChart()
    mediaQuery.addEventListener('change', handleThemeChange)
  })

  onUnmounted(() => {
    destroyChart()
    mediaQuery.removeEventListener('change', handleThemeChange)
  })

  return { updateChart, destroyChart }
}

export function useMonthlyChart(
  canvasRef: Ref<HTMLCanvasElement | null>,
  days: Ref<DayRecord[]>
) {
  let chart: Chart | null = null
  const isDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)

  const chartData = computed(() => {
    const monthMap = new Map<string, number>()

    days.value.forEach(day => {
      if (day.status !== 'open') return
      const date = new Date(day.date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const dayProfit = day.trades?.reduce((sum, t) => sum + (Number(t.profit) || 0), 0) || 0

      if (!monthMap.has(key)) {
        monthMap.set(key, 0)
      }
      monthMap.set(key, monthMap.get(key)! + dayProfit)
    })

    const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    const labels = sortedMonths.map(([key]) => {
      const [year, month] = key.split('-')
      return `${year}/${month}`
    })

    const data = sortedMonths.map(([, profit]) => profit)
    const colors = data.map(v => v >= 0 ? '#34d399' : '#f87171')

    return { labels, data, colors }
  })

  function createChart() {
    if (!canvasRef.value) return

    const ctx = canvasRef.value.getContext('2d')
    if (!ctx) return

    const gridColor = isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'
    const textColor = isDark.value ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.value.labels,
        datasets: [{
          label: '月度收益',
          data: chartData.value.data,
          backgroundColor: chartData.value.colors,
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark.value ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark.value ? '#f9fafb' : '#0f172a',
            bodyColor: isDark.value ? '#f9fafb' : '#0f172a',
            borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              label: (item) => formatMoneyShort(item.raw as number)
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 11 },
              callback: (value) => `¥${value}`
            }
          }
        }
      }
    })
  }

  function updateChart() {
    if (!chart) return

    chart.data.labels = chartData.value.labels
    chart.data.datasets[0].data = chartData.value.data
    chart.data.datasets[0].backgroundColor = chartData.value.colors
    chart.update()
  }

  function destroyChart() {
    if (chart) {
      chart.destroy()
      chart = null
    }
  }

  watch(chartData, () => {
    if (chart) {
      updateChart()
    }
  })

  onMounted(() => {
    createChart()
  })

  onUnmounted(() => {
    destroyChart()
  })

  return { updateChart, destroyChart }
}

