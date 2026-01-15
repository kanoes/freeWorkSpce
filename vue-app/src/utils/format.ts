import type { FormattedDate } from '@/types'

/**
 * 格式化日期
 */
export function formatDate(dateStr: string): FormattedDate {
  const d = new Date(dateStr)
  return {
    full: d.toISOString().split('T')[0],
    day: d.getDate(),
    month: d.toLocaleDateString('zh-CN', { month: 'short' }),
    year: d.getFullYear(),
    weekday: d.toLocaleDateString('zh-CN', { weekday: 'short' })
  }
}

/**
 * 格式化金额（带正负号）
 */
export function formatMoney(amount: number | string): string {
  const num = Number(amount) || 0
  const prefix = num >= 0 ? '+' : ''
  return `${prefix}¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/**
 * 格式化金额（不带正负号）
 */
export function formatMoneyShort(amount: number | string): string {
  const num = Number(amount) || 0
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 获取今天的日期字符串
 */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * 获取月份键值 (YYYY-MM)
 */
export function getMonthKey(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

