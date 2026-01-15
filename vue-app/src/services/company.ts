import type { CompanyDataResponse } from '@/types'

interface CompanyInfo {
  name: string
  market: string
}

const companyMap = new Map<string, CompanyInfo>()

/**
 * 加载公司数据
 */
export async function loadCompanyData(): Promise<void> {
  try {
    const response = await fetch('./companies_tse.json')
    if (!response.ok) return

    const data: CompanyDataResponse = await response.json()
    if (data.companies && Array.isArray(data.companies)) {
      data.companies.forEach(company => {
        companyMap.set(company.code.toUpperCase(), {
          name: company.name,
          market: company.market
        })
      })
      console.log(`Loaded ${companyMap.size} company records`)
    }
  } catch (err) {
    console.warn('Could not load company data:', err)
  }
}

/**
 * 根据股票代码获取公司名称
 */
export function getCompanyName(code: string): string {
  if (!code) return ''
  const company = companyMap.get(code.toUpperCase())
  return company ? company.name : code
}

/**
 * 获取股票显示名称
 */
export function getStockDisplayName(code: string): string {
  if (!code) return ''
  const company = companyMap.get(code.toUpperCase())
  return company ? company.name : code
}

/**
 * 检查公司是否存在
 */
export function hasCompany(code: string): boolean {
  if (!code) return false
  return companyMap.has(code.toUpperCase())
}

