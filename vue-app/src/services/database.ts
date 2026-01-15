import type { DayRecord } from '@/types'

const DB_NAME = 'tradediary_db'
const DB_VERSION = 1
const STORE_NAME = 'days'

let dbInstance: IDBDatabase | null = null

/**
 * 打开数据库连接
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('date', 'date', { unique: true })
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * 获取所有日记录（按日期降序）
 */
export async function getAllDays(): Promise<DayRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('date')
    const request = index.openCursor(null, 'prev')
    const results: DayRecord[] = []

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        results.push(cursor.value as DayRecord)
        cursor.continue()
      } else {
        resolve(results)
      }
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * 根据日期获取记录
 */
export async function getDayByDate(dateStr: string): Promise<DayRecord | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('date')
    const request = index.get(dateStr)

    request.onsuccess = () => resolve((request.result as DayRecord) || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 保存日记录
 */
export async function saveDay(day: DayRecord): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(day)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 删除日记录
 */
export async function deleteDay(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 清空所有数据
 */
export async function clearAllDays(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

