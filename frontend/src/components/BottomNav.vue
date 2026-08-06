<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-bottom-navigation grow :model-value="activeTab" @update:model-value="navigate" style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 100; padding-bottom: env(safe-area-inset-bottom);">
    <v-btn v-for="tab in tabs" :key="tab.path" :value="tab.path">
      <v-icon>{{ tab.icon }}</v-icon>
      <span class="text-caption">{{ tab.title }}</span>
    </v-btn>
  </v-bottom-navigation>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { title: 'Chat', icon: 'mdi-message-text-outline', path: '/chat' },
  { title: 'Đơn thiết kế', icon: 'mdi-palette-outline', path: '/orders' },
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', path: '/' },
];

const activeTab = computed(() => {
  const currentPath = route.path;
  if (currentPath.startsWith('/chat')) return '/chat';
  if (currentPath.startsWith('/orders')) return '/orders';
  return '/';
});

function navigate(path: string) {
  router.push(path);
}
</script>

<style scoped>
.v-bottom-navigation {
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
</style>
