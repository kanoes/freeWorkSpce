<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const pasteText = ref('')

watch(() => store.importPasteSheetOpen, (open) => {
  if (open) {
    pasteText.value = ''
  }
})

async function handleConfirm() {
  const text = pasteText.value.trim()
  if (!text) {
    alert('请粘贴数据')
    return
  }

  try {
    const data = JSON.parse(text)
    await store.importData(data)
    alert('导入成功！')
    store.importPasteSheetOpen = false
    store.settingsSheetOpen = false
  } catch (err) {
    alert('导入失败：' + ((err as Error).message || err))
  }
}

function handleClose() {
  store.importPasteSheetOpen = false
  pasteText.value = ''
}
</script>

<template>
  <div class="sheet" :aria-hidden="!store.importPasteSheetOpen">
    <div class="sheet-backdrop" @click="handleClose"></div>
    <div class="sheet-panel">
      <div class="sheet-header">
        <div>
          <h3 class="sheet-title">粘贴导入</h3>
          <p class="sheet-subtitle">将复制的数据粘贴到下方</p>
        </div>
        <button class="icon-btn small" @click="handleClose">✕</button>
      </div>

      <div class="import-paste-content">
        <textarea 
          v-model="pasteText"
          class="paste-textarea" 
          placeholder="在此粘贴 JSON 数据..."
        ></textarea>
        <div class="paste-actions">
          <button type="button" class="btn secondary" @click="handleClose">取消</button>
          <button type="button" class="btn primary" @click="handleConfirm">确认导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

