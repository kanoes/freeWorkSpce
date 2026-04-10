import { compactText, trimText } from './utils.js';

let companyMapPromise = null;

async function loadCompanyMap() {
  if (!companyMapPromise) {
    companyMapPromise = import('../../../companies_tse.json').then((module) => {
      const payload = module?.default || module;
      const map = new Map();

      if (Array.isArray(payload?.companies)) {
        payload.companies.forEach((company) => {
          map.set(compactText(company.code).toUpperCase(), {
            name: trimText(company.name),
            market: trimText(company.market)
          });
        });
      }

      return map;
    });
  }

  return companyMapPromise;
}

export function getStockDisplayName(symbol, fallbackName = '') {
  return trimText(fallbackName || symbol || '');
}

export async function findCompanyNameBySymbol(symbol) {
  const normalizedSymbol = compactText(symbol).toUpperCase();
  if (!normalizedSymbol) return '';

  const companyMap = await loadCompanyMap();
  return companyMap.get(normalizedSymbol)?.name || '';
}
