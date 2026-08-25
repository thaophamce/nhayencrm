<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-app>
    <OfflineIndicator />

    <!-- Slim mobile app bar -->
    <v-app-bar v-if="!threadOpen" density="compact" flat class="cl-mobile-bar">
      <!-- If on Chat route, show back button and Zalo account name instead of brand logo and title -->
      <div v-if="route.path.startsWith('/chat')" class="d-flex align-center ml-2">
        <button class="back-to-select-btn" @click="router.push('/select-account')" title="Trở về trang chọn tài khoản">
          <v-icon size="20" class="mr-1">mdi-chevron-left</v-icon>
          <span class="back-account-name">{{ activeAccountName }}</span>
        </button>
      </div>
      <div v-else class="d-flex align-center ml-3 cl-mobile-brand">
        <v-img src="/brand/logovip.png" width="28" height="28" contain class="mr-1" />
        <span class="font-weight-bold text-body-2 cl-mobile-brand__name">Thiệp Cưới <span>Nhà Yến</span></span>
      </div>

      <v-spacer />

      <NotificationBell />
      <v-btn icon size="small" variant="text" aria-label="Đăng xuất" @click="logout" class="mr-2 cl-mobile-logout">
        <v-icon size="18">mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Main content with padding for bottom nav -->
    <v-main>
      <div class="cl-mobile-main-content">
        <slot />
      </div>
    </v-main>

    <BottomNav v-if="!threadOpen" />
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter, useRoute } from 'vue-router';
import { useWorkScope } from '@/composables/use-work-scope';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';
import { useMobileChatLayout } from '@/composables/use-mobile-chat-layout';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const workScope = useWorkScope();
const { accounts: zaloAccounts, fetchAccounts: fetchZaloAccounts } = useZaloAccounts();
const { threadOpen } = useMobileChatLayout();

const currentScopeId = computed(() => workScope.accountIds.value[0] ?? null);
const activeAccountName = computed(() => {
  if (!currentScopeId.value) return 'Tất cả tài khoản';
  const acc = (zaloAccounts.value || []).find(a => a.id === currentScopeId.value);
  return acc ? acc.displayName : 'Tất cả tài khoản';
});

onMounted(() => {
  void fetchZaloAccounts();
});


function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.cl-mobile-bar {
  background: color-mix(in srgb, var(--surface) 85%, transparent) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 80%, transparent) !important;
  color: var(--ink);
  font-family: var(--font);
}
.cl-mobile-brand {
  gap: 8px;
}
.cl-mobile-brand__name {
  color: var(--ink);
  font-family: var(--font);
}
.cl-mobile-brand__name span {
  color: var(--brand);
}
.cl-mobile-logout {
  color: var(--ink-3) !important;
}
.back-to-select-btn {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--r-xs);
  transition: background-color 0.2s, color 0.2s;
  color: var(--ink);
  font-family: var(--font);
}
.back-to-select-btn:active {
  background-color: var(--brand-soft);
  color: var(--brand);
}
.back-account-name {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
</style>
