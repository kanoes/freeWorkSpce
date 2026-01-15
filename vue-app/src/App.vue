<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { loadCompanyData } from '@/services/company'
import MainPage from '@/components/MainPage.vue'
import AnalysisPage from '@/components/AnalysisPage.vue'
import DividendPage from '@/components/DividendPage.vue'
import DaySheet from '@/components/DaySheet.vue'
import SettingsSheet from '@/components/SettingsSheet.vue'
import ImportPasteSheet from '@/components/ImportPasteSheet.vue'

const store = useAppStore()

onMounted(async () => {
  await loadCompanyData()
  await store.loadDays()
})
</script>

<template>
  <!-- Pages -->
  <MainPage v-if="store.currentView === 'main'" />
  <AnalysisPage v-else-if="store.currentView === 'analysis'" />
  <DividendPage v-else-if="store.currentView === 'dividend'" />

  <!-- Sheets -->
  <DaySheet />
  <SettingsSheet />
  <ImportPasteSheet />
</template>

<style src="./assets/styles.css"></style>

