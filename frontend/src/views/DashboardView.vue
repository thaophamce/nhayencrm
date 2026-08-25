<template>
  <MobileDashboardView v-if="isMobile" />
  <main v-else class="executive-dashboard">
    <div class="executive-dashboard__inner">
      <header class="executive-dashboard__head">
        <div>
          <span class="executive-dashboard__eyebrow">TRUNG TÂM ĐIỀU HÀNH</span>
          <h1>Tổng quan Nhà Yến</h1>
          <p>Những chỉ số quan trọng nhất từ toàn bộ hoạt động kinh doanh.</p>
        </div>
        <div class="executive-dashboard__actions">
          <span class="executive-dashboard__updated">
            <v-icon icon="mdi-clock-outline" size="16" />
            {{ updatedLabel }}
          </span>
          <button class="executive-dashboard__refresh" type="button" :disabled="refreshing" @click="refresh">
            <v-icon :icon="refreshing ? 'mdi-loading' : 'mdi-refresh'" :class="{ 'mdi-spin': refreshing }" size="17" />
            <span>Làm mới dữ liệu</span>
          </button>
        </div>
      </header>

      <section class="executive-dashboard__kpis" aria-label="Chỉ số tổng quan">
        <ExecutiveKpiCard v-for="item in kpis" :key="item.key" :item="item" @open="open" />
      </section>

      <section class="executive-dashboard__modules" aria-label="Tình hình từng bộ phận">
        <ExecutiveModuleCard v-for="module in modules" :key="module.key" :module="module" @open="open" />
        <ExecutiveAlertCard :alerts="alerts" @open="open" />
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import MobileDashboardView from '@/views/MobileDashboardView.vue';
import ExecutiveAlertCard from '@/components/executive-dashboard/ExecutiveAlertCard.vue';
import ExecutiveKpiCard from '@/components/executive-dashboard/ExecutiveKpiCard.vue';
import ExecutiveModuleCard from '@/components/executive-dashboard/ExecutiveModuleCard.vue';
import { useExecutiveDashboard } from '@/composables/use-executive-dashboard';
import { useMobile } from '@/composables/use-mobile';
import '@/assets/executive-dashboard.css';

const router = useRouter();
const { isMobile } = useMobile();
const { kpis, modules, alerts, lastUpdated, refreshing, refresh } = useExecutiveDashboard();

const updatedLabel = computed(() => {
  if (!lastUpdated.value) return 'Đang đồng bộ dữ liệu';
  return `Cập nhật lúc ${lastUpdated.value.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
});

function open(route: string) {
  if (route === '/') {
    document.querySelector('.executive-alerts')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    return;
  }
  void router.push(route);
}
</script>
