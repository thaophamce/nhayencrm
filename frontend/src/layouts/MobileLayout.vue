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
      <div v-else class="d-flex align-center ml-3" style="gap: 8px;">
        <v-img src="/brand/logovip.png" width="28" height="28" contain class="mr-1" />
        <span class="font-weight-bold text-body-2" style="color: #0F172A; font-family: 'Quicksand', sans-serif;">Thiệp Cưới <span style="color: #2563EB;">Nhà Yến</span></span>
      </div>

      <v-spacer />

      <NotificationBell />
      <v-btn icon size="small" variant="text" @click="logout" class="mr-2">
        <v-icon size="18" color="grey-darken-1">mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Main content with padding for bottom nav -->
    <v-main>
      <div class="cl-mobile-main-content">
        <slot />
      </div>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter, useRoute } from 'vue-router';
import { useWorkScope } from '@/composables/use-work-scope';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';
import { useMobileChatLayout } from '@/composables/use-mobile-chat-layout';

const theme = useTheme();
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
  theme.global.name.value = 'light';
  void fetchZaloAccounts();
});


function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.cl-mobile-bar {
  background: rgba(255, 255, 255, 0.85) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8) !important;
}
.theme--dark .cl-mobile-bar {
  background: rgba(15, 23, 42, 0.85) !important;
  border-bottom: 1px solid rgba(51, 65, 85, 0.8) !important;
}
.back-to-select-btn {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: all 0.2s;
  color: #1E202C;
}
.back-to-select-btn:active {
  background-color: #EBF3FF;
  color: #2F80ED;
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
