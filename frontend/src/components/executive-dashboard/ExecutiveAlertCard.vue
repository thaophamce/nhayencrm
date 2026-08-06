<template>
  <section class="executive-alerts">
    <header>
      <div>
        <span class="executive-alerts__icon"><v-icon icon="mdi-bell-alert-outline" size="21" /></span>
        <div>
          <h2>Cảnh báo điều hành</h2>
          <p>Ưu tiên được tổng hợp từ toàn hệ thống</p>
        </div>
      </div>
      <span class="executive-alerts__count">{{ alerts.length }}</span>
    </header>

    <div v-if="alerts.length" class="executive-alerts__list">
      <button
        v-for="alert in alerts.slice(0, 5)"
        :key="alert.key"
        type="button"
        :class="`level-${alert.level}`"
        @click="$emit('open', alert.route)"
      >
        <span class="executive-alerts__item-icon"><v-icon :icon="alert.icon" size="18" /></span>
        <span>
          <strong>{{ alert.title }}</strong>
          <small>{{ alert.detail }}</small>
        </span>
        <v-icon icon="mdi-chevron-right" size="18" aria-hidden="true" />
      </button>
    </div>

    <div v-else class="executive-alerts__empty">
      <span><v-icon icon="mdi-check-circle-outline" size="25" /></span>
      <div><strong>Vận hành ổn định</strong><small>Chưa có cảnh báo cần xử lý ngay.</small></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ExecutiveAlert } from './types';

defineProps<{ alerts: ExecutiveAlert[] }>();
defineEmits<{ open: [route: string] }>();
</script>
