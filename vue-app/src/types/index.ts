// 交易记录
export interface Trade {
  symbol: string
  profit: number | string
}

// 市场状态
export type MarketStatus = 'open' | 'holiday' | 'closed'

// 日记录
export interface DayRecord {
  id: string
  date: string
  status: MarketStatus
  trades: Trade[]
  updatedAt: string
}

// 公司信息
export interface Company {
  code: string
  name: string
  market: string
}

// 公司数据响应
export interface CompanyDataResponse {
  companies: Company[]
}

// 导出数据格式
export interface ExportData {
  exportedAt: string
  version: string
  days: DayRecord[]
}

// 日期格式化结果
export interface FormattedDate {
  full: string
  day: number
  month: string
  year: number
  weekday: string
}

// 股票统计
export interface StockStats {
  symbol: string
  profit: number
  tradeCount: number
}

// 图表范围
export type ChartRange = 'week' | 'month' | 'all'

// 分红历史记录
export interface DividendRecord extends DayRecord {
  profit: number
  dividend: number
}

