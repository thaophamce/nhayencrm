<template>
  <v-app class="smax-app chat-site-app">
    <header class="smax-topnav chat-site-header">
      <a class="header-wordmark" href="/chat" aria-label="Nhà Yến Chat">
        <img src="/brand/brand-mark.png" alt="" />
        <span>Nhà Yến Chat</span>
      </a>

      <v-menu location="bottom center" :close-on-content-click="true">
        <template #activator="{ props }">
          <button
            v-bind="props"
            class="active-nick"
            type="button"
            :aria-label="`Nick Zalo đang làm việc: ${activeNickLabel}`"
          >
            <Avatar
              :src="activeNick?.avatarUrl"
              :name="activeNickLabel"
              :size="30"
              :platform="null"
            />
            <span class="active-nick-copy">
              <strong>{{ activeNickLabel }}</strong>
              <small><i :class="['status-dot', activeNickStatusClass]" />{{ activeNickStatusText }}</small>
            </span>
            <v-icon size="16">mdi-chevron-down</v-icon>
          </button>
        </template>

        <v-list class="nick-menu" density="compact" min-width="260">
          <v-list-item :active="workScope.accountIds.value.length === 0" @click="selectNick(null)">
            <template #prepend><v-icon size="19">mdi-account-multiple-outline</v-icon></template>
            <v-list-item-title>Tất cả nick Zalo</v-list-item-title>
            <v-list-item-subtitle>{{ accounts.length }} nick được phép truy cập</v-list-item-subtitle>
          </v-list-item>
          <v-divider />
          <v-list-item
            v-for="account in accounts"
            :key="account.id"
            :active="workScope.accountIds.value.length === 1 && workScope.accountIds.value[0] === account.id"
            @click="selectNick(account.id)"
          >
            <template #prepend>
              <Avatar :src="account.avatarUrl" :name="account.displayName || 'Zalo'" :size="28" :platform="null" />
            </template>
            <v-list-item-title>{{ account.displayName || account.phone || 'Nick Zalo' }}</v-list-item-title>
            <v-list-item-subtitle>{{ account.status === 'connected' ? 'Đã kết nối' : 'Mất kết nối' }}</v-list-item-subtitle>
          </v-list-item>
          <v-list-item v-if="!loading && accounts.length === 0" disabled>
            <v-list-item-title>Chưa có nick Zalo</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-menu location="bottom end" :close-on-content-click="true">
        <template #activator="{ props }">
          <button
            v-bind="props"
            class="chat-site-user"
            type="button"
            :aria-label="`Tài khoản ${auth.user?.fullName || ''}`"
          >
            <Avatar :src="auth.user?.avatarUrl" :name="auth.user?.fullName || 'U'" :size="30" :platform="null" />
            <span>{{ auth.user?.fullName }}</span>
            <v-icon size="16">mdi-chevron-down</v-icon>
          </button>
        </template>

        <v-list class="user-menu" density="compact" min-width="220">
          <v-list-item :href="crmUrl">
            <template #prepend><v-icon size="19">mdi-view-dashboard-outline</v-icon></template>
            <v-list-item-title>Mở Nhà Yến CRM</v-list-item-title>
          </v-list-item>
          <v-divider />
          <v-list-item @click="logout">
            <template #prepend><v-icon size="19">mdi-logout</v-icon></template>
            <v-list-item-title>Đăng xuất</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </header>
    <v-main class="smax-main chat-site-main">
      <slot />
    </v-main>
    <ToastContainer />
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '@/components/ui/Avatar.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import { useWorkScope } from '@/composables/use-work-scope';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const crmUrl = import.meta.env.VITE_CRM_URL || 'https://nhayencrm.com';
const workScope = useWorkScope();
const { accounts, loading, fetchAccounts } = useZaloAccounts();

const activeNick = computed(() => {
  const ids = workScope.accountIds.value;
  return ids.length === 1 ? accounts.value.find((account) => account.id === ids[0]) ?? null : null;
});

const activeNickLabel = computed(() => {
  const ids = workScope.accountIds.value;
  if (ids.length === 0) return accounts.value.length ? `Tất cả ${accounts.value.length} nick Zalo` : 'Tất cả nick Zalo';
  if (ids.length > 1) return `${ids.length} nick đã chọn`;
  return activeNick.value?.displayName || activeNick.value?.phone || 'Nick Zalo';
});

const activeNickStatusText = computed(() => {
  if (workScope.accountIds.value.length !== 1) {
    const connected = accounts.value.filter((account) => account.status === 'connected').length;
    return accounts.value.length ? `${connected}/${accounts.value.length} đang kết nối` : 'Đang tải danh sách nick';
  }
  return activeNick.value?.status === 'connected' ? 'Đã kết nối' : 'Mất kết nối';
});

const activeNickStatusClass = computed(() => {
  if (workScope.accountIds.value.length !== 1) {
    return accounts.value.some((account) => account.status === 'connected') ? 'is-connected' : 'is-offline';
  }
  return activeNick.value?.status === 'connected' ? 'is-connected' : 'is-offline';
});

function selectNick(accountId: string | null) {
  workScope.lockToNick(accountId);
}

function logout() {
  auth.logout();
  void router.replace('/login');
}

onMounted(() => {
  void fetchAccounts();
});
</script>

<style scoped>
.chat-site-header {
  background: #1a6fd4;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
  align-items: center;
  gap: 12px;
  height: 52px;
  max-height: 52px;
  min-height: 52px;
  overflow: hidden;
  padding: 0 16px;
  position: sticky;
  top: 0;
  width: 100%;
  z-index: 100;
}

.header-wordmark {
  align-items: center;
  display: flex;
  gap: 8px;
  height: 34px;
  justify-content: center;
  overflow: hidden;
  justify-self: start;
  width: max-content;
}

.header-wordmark img {
  display: block;
  height: 34px;
  max-height: 34px;
  max-width: 28px;
  object-fit: contain;
  width: 28px;
}

.header-wordmark span {
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}

.chat-site-main {
  min-height: 0;
  overflow: hidden;
}

.active-nick,
.chat-site-user {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: #fff;
  cursor: pointer;
  display: flex;
  min-width: 0;
  padding: 4px 8px;
}

.active-nick {
  gap: 9px;
  justify-self: center;
  max-width: 340px;
}

.active-nick:hover,
.chat-site-user:hover,
.active-nick[aria-expanded='true'],
.chat-site-user[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.14);
}

.active-nick-copy {
  display: grid;
  min-width: 0;
  text-align: left;
}

.active-nick-copy strong {
  font-size: 13px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-nick-copy small {
  align-items: center;
  color: rgba(255, 255, 255, 0.78);
  display: flex;
  font-size: 10px;
  gap: 5px;
  line-height: 1.3;
}

.status-dot {
  background: #fca5a5;
  border-radius: 50%;
  display: inline-block;
  height: 6px;
  width: 6px;
}

.status-dot.is-connected {
  background: #86efac;
}

.chat-site-user {
  font-size: 12px;
  gap: 8px;
  justify-self: end;
  max-width: 190px;
}

.chat-site-user span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nick-menu :deep(.v-list-item__prepend),
.user-menu :deep(.v-list-item__prepend) {
  margin-right: 10px;
}

@media (max-width: 900px) {
  .chat-site-header {
    grid-template-columns: minmax(44px, 1fr) auto minmax(44px, 1fr);
    padding-inline: 8px;
  }

  .header-wordmark span,
  .chat-site-user span {
    display: none;
  }

  .active-nick {
    max-width: 230px;
  }
}

@media (max-width: 560px) {
  .active-nick-copy small {
    display: none;
  }

  .active-nick {
    max-width: 190px;
  }
}
</style>
