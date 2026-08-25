<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-bottom-navigation grow :model-value="activeTab" @update:model-value="navigate" class="cl-bottom-nav">
    <v-btn v-for="tab in visibleTabs" :key="tab.path" :value="tab.path" :aria-label="tab.title">
      <v-icon>{{ tab.icon }}</v-icon>
      <span class="cl-bottom-nav__label">{{ tab.title }}</span>
    </v-btn>
  </v-bottom-navigation>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const tabs = [
  { title: 'Tổng quan', icon: 'mdi-view-dashboard-outline', path: '/', resource: 'dashboard' },
  { title: 'Hội thoại', icon: 'mdi-message-text-outline', path: '/chat', resource: 'conversation' },
  { title: 'Đơn thiết kế', icon: 'mdi-palette-outline', path: '/orders', resource: 'orders', tab: 'overview' },
  { title: 'Giao vận', icon: 'mdi-truck-delivery-outline', path: '/pancake-orders', resource: 'delivery', tab: 'overview' },
  { title: 'Tài chính', icon: 'mdi-finance', path: '/finance', resource: 'finance', tab: 'overview' },
  { title: 'Nhân sự', icon: 'mdi-calendar-account-outline', path: '/salary', resource: 'attendance', tab: 'salaryMine' },
];

const visibleTabs = computed(() => tabs.filter(tab => authStore.canAccess(tab.resource)));

const activeTab = computed(() => {
  const currentPath = route.path;
  if (currentPath.startsWith('/chat')) return '/chat';
  if (currentPath.startsWith('/orders')) return '/orders';
  if (currentPath.startsWith('/pancake-orders')) return '/pancake-orders';
  if (currentPath.startsWith('/finance')) return '/finance';
  if (currentPath.startsWith('/salary')) return '/salary';
  return '/';
});

function navigate(path: string) {
  const tab = tabs.find(t => t.path === path);
  router.push(tab?.tab ? { path, query: { tab: tab.tab } } : path);
}
</script>

<style scoped>
.v-bottom-navigation {
  position: fixed !important;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(255, 255, 255, 0.75) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  border-top: 1px solid rgba(226, 232, 240, 0.8) !important;
  box-shadow: 0 -4px 12px rgba(15, 23, 42, 0.03) !important;
}
.theme--dark .v-bottom-navigation {
  background: rgba(15, 23, 42, 0.75) !important;
  border-top: 1px solid rgba(51, 65, 85, 0.8) !important;
}
.cl-bottom-nav__label {
  max-width: 76px;
  overflow: hidden;
  color: currentColor;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.v-btn--active) {
  color: var(--brand) !important;
}
</style>
