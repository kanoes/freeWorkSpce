<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { todayStr } from '@/utils/format'

const store = useAppStore()
const fileInput = ref<HTMLInputElement | null>(null)

function exportData() {
  const data = store.getExportData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `甜饼工坊-backup-${todayStr()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function exportToClipboard() {
  if (!confirm('确定要复制所有数据到剪贴板吗？')) return

  const data = store.getExportData()
  const text = JSON.stringify(data, null, 2)

  try {
    await navigator.clipboard.writeText(text)
    alert('已复制到剪贴板！')
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
    alert('已复制到剪贴板！')
  }
}

async function handleFileImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)
    await store.importData(data)
    alert('导入成功！')
    store.settingsSheetOpen = false
  } catch (err) {
    alert('导入失败：' + ((err as Error).message || err))
  }

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

async function handleClearAll() {
  if (confirm('确定要清空所有数据吗？此操作不可撤销！')) {
    await store.clearAll()
    store.settingsSheetOpen = false
  }
}
</script>

<template>
  <div class="sheet" :aria-hidden="!store.settingsSheetOpen">
    <div class="sheet-backdrop" @click="store.settingsSheetOpen = false"></div>
    <div class="sheet-panel">
      <div class="sheet-header">
        <div>
          <h3 class="sheet-title">设置</h3>
          <p class="sheet-subtitle">数据管理</p>
        </div>
        <button class="icon-btn small" @click="store.settingsSheetOpen = false">✕</button>
      </div>

      <div class="settings-list">
        <div class="settings-section-title">导出数据</div>
        
        <button class="settings-item" @click="exportData">
          <div class="settings-item-content">
            <span class="settings-icon">💾</span>
            <div>
              <div class="settings-title">下载 JSON 文件</div>
              <div class="settings-desc">保存备份文件到设备</div>
            </div>
          </div>
          <span class="chevron">›</span>
        </button>

        <button class="settings-item" @click="exportToClipboard">
          <div class="settings-item-content">
            <span class="settings-icon">📋</span>
            <div>
              <div class="settings-title">复制到剪贴板</div>
              <div class="settings-desc">复制数据文本方便分享</div>
            </div>
          </div>
          <span class="chevron">›</span>
        </button>

        <div class="settings-section-title">导入数据</div>

        <label class="settings-item file-label">
          <div class="settings-item-content">
            <span class="settings-icon">📂</span>
            <div>
              <div class="settings-title">从文件导入</div>
              <div class="settings-desc">选择 JSON 备份文件</div>
            </div>
          </div>
          <input 
            ref="fileInput"
            type="file" 
            accept="application/json" 
            hidden 
            @change="handleFileImport"
          />
          <span class="chevron">›</span>
        </label>

        <button class="settings-item" @click="store.importPasteSheetOpen = true">
          <div class="settings-item-content">
            <span class="settings-icon">📝</span>
            <div>
              <div class="settings-title">粘贴文本导入</div>
              <div class="settings-desc">粘贴之前复制的数据</div>
            </div>
          </div>
          <span class="chevron">›</span>
        </button>

        <div class="settings-section-title">危险操作</div>

        <button class="settings-item danger" @click="handleClearAll">
          <div class="settings-item-content">
            <span class="settings-icon">🗑️</span>
            <div>
              <div class="settings-title">清空所有数据</div>
              <div class="settings-desc">此操作不可撤销</div>
            </div>
          </div>
          <span class="chevron">›</span>
        </button>
      </div>

      <div class="settings-footer">
        <p>甜饼工坊 v3.0</p>
        <p>数据仅保存在本地设备</p>
      </div>
    </div>
  </div>
</template>

