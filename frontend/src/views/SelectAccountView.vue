<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="select-account-container">
    <div class="dashboard-header">
      <div class="dh-title-section">
        <h1 class="dh-title">Bảng điều khiển</h1>
        <div class="search-box">
          <v-icon class="search-icon">mdi-magnify</v-icon>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm kiếm tài khoản..."
            class="search-input"
          />
        </div>
      </div>
      <div class="dh-actions">
        <button class="action-btn" @click="refreshData" :disabled="loading">
          <v-icon :class="{ 'spin': loading }">mdi-refresh</v-icon>
        </button>
        <button class="action-btn primary-btn" @click="goToIntegrations">
          <v-icon start>mdi-plus</v-icon>
          Kết nối
        </button>
      </div>
    </div>

    <!-- Active Filter Info (Mobile Friendly) -->
    <div class="filter-info-bar">
      <span>Đang hiển thị tài khoản Zalo đã từng hoặc đang kết nối</span>
      <span class="count-badge">{{ visibleAccountCount }}</span>
    </div>

    <!-- Accounts Grid & List -->
    <div v-if="loading" class="loading-state">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="mt-4">Đang tải danh sách tài khoản Zalo...</p>
    </div>

    <div v-else class="accounts-list">
      <!-- Option "Tất cả tài khoản Zalo" -->
      <div
        class="account-card all-card"
        @click="selectAccount(null)"
      >
        <div class="card-avatar all-avatar">
          <v-icon size="28" color="primary">mdi-apps</v-icon>
        </div>
        <div class="card-info">
          <div class="card-name font-weight-bold">Tất cả tài khoản Zalo</div>
          <div class="card-sub text-caption">Xem hội thoại chung của mọi Zalo nick</div>
        </div>
        <div class="status-indicator all-indicator">
          <span>Tổng quan</span>
        </div>
      </div>

      <!-- Real Zalo Accounts -->
      <div
        v-for="acc in filteredAccounts"
        :key="acc.id"
        class="account-card"
        @click="selectAccount(acc)"
        :class="{ 'disconnected-card': acc.status !== 'connected' }"
      >
        <div class="card-avatar">
          <img v-if="acc.avatarUrl" :src="acc.avatarUrl" :alt="acc.displayName" />
          <div v-else class="avatar-placeholder" :style="{ backgroundColor: getAvatarColor(acc.displayName) }">
            {{ (acc.displayName || 'U').charAt(0).toUpperCase() }}
          </div>
        </div>

        <div class="card-info">
          <div class="card-name">{{ acc.displayName }}</div>
          <div class="card-sub">
            <v-icon size="14" color="#0068FF" class="mr-1">mdi-chat</v-icon>
            <span class="platform-name">Zalo</span>
            <span v-if="acc.phone" class="phone-sub"> · {{ acc.phone }}</span>
          </div>
        </div>

        <div class="status-indicator" :class="acc.status">
          <v-icon size="10" class="mr-1">mdi-circle</v-icon>
          <span>{{ acc.status === 'connected' ? 'Đang kết nối' : 'Mất kết nối' }}</span>
        </div>
      </div>

      <!-- Local Pancake Chat adapter: xuất hiện như một nick Zalo để thử trong ChatView thật. -->
      <button
        v-if="showPancakeCard"
        type="button"
        class="account-card pancake-card"
        :class="{ 'pancake-connected': pancakeConnected }"
        @click="openPancakeAccount"
      >
        <div class="card-avatar pancake-avatar">
          <v-icon size="24">mdi-message-text-outline</v-icon>
        </div>

        <div class="card-info">
          <div class="card-name">{{ pancakeAccountName }}</div>
          <div class="card-sub">
            <v-icon size="14" color="#0068FF" class="mr-1">mdi-api</v-icon>
            <span class="platform-name">Zalo qua Pancake API</span>
            <span class="phone-sub"> · Local</span>
          </div>
        </div>

        <div class="status-indicator" :class="pancakeConnected ? 'connected' : 'pancake-pending'">
          <v-icon size="10" class="mr-1">{{ pancakeConnected ? 'mdi-circle' : 'mdi-link-variant-plus' }}</v-icon>
          <span>{{ pancakeConnected ? 'Đang kết nối' : 'Nhập token' }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { useWorkScope } from '@/composables/use-work-scope';
import { usePancakeChatSession } from '@/composables/use-pancake-chat-session';

const router = useRouter();
const workScope = useWorkScope();
const { accounts: zaloAccounts, fetchAccounts: fetchZaloAccounts, loading } = useZaloAccounts();
const pancakeSession = usePancakeChatSession();

const searchQuery = ref('');
const pancakeConnected = computed(() =>
  import.meta.env.DEV && Boolean(pancakeSession.preview.value?.connection.id),
);
const pancakeAccountName = computed(() =>
  pancakeSession.preview.value?.connection.displayName || 'Pancake Zalo',
);
const showPancakeCard = computed(() => {
  if (!import.meta.env.DEV) return false;
  const query = searchQuery.value.trim().toLocaleLowerCase('vi');
  if (!query) return true;
  return `${pancakeAccountName.value} zalo pancake api local`.toLocaleLowerCase('vi').includes(query);
});
const visibleAccountCount = computed(() => filteredAccounts.value.length + (showPancakeCard.value ? 1 : 0));

async function refreshData() {
  await fetchZaloAccounts();
}

onMounted(async () => {
  await fetchZaloAccounts();
});

// Filter Zalo accounts that are connected or disconnected
const filteredAccounts = computed(() => {
  let list = (zaloAccounts.value || []).map(acc => {
    const status = acc.liveStatus || acc.status;
    return {
      id: acc.id,
      displayName: acc.displayName || acc.phone || 'Zalo Account',
      avatarUrl: acc.avatarUrl || '',
      phone: acc.phone || '',
      platform: 'zalo',
      status,
      pinned: status === 'connected',
    };
  });

  // Chỉ hiển thị zalo nào đã từng kết nối (disconnected) hoặc đang kết nối (connected)
  list = list.filter(acc => acc.status === 'connected' || acc.status === 'disconnected');

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(acc =>
      acc.displayName.toLowerCase().includes(q) ||
      (acc.phone && acc.phone.toLowerCase().includes(q))
    );
  }

  // Đang kết nối lên đầu
  return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
});

function getAvatarColor(name: string) {
  const colors = ['#FF5A5F', '#2EC4B6', '#FF9F1C', '#4DA3FF', '#2F80ED', '#9c27b0'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function selectAccount(acc: any) {
  if (acc === null) {
    workScope.lockToNick(null);
    router.push('/chat');
  } else {
    workScope.lockToNick(acc.id);
    router.push('/chat');
  }
}

function openPancakeAccount() {
  if (pancakeConnected.value) {
    router.push({ path: '/chat', query: { source: 'pancake' } });
    return;
  }
  router.push('/dev/pancake-chat');
}

function goToIntegrations() {
  router.push({ path: '/settings/channels/zalo', query: { connect: '1' } });
}
</script>

<style scoped>
.select-account-container {
  padding: 16px;
  background-color: #F0F2F5;
  min-height: 100vh;
  width: 100%;
  max-width: 100%;
  font-family: 'Quicksand', sans-serif !important;
}

/* Header Styles */
.dashboard-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.dh-title-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dh-title {
  font-size: 20px;
  font-weight: 700;
  color: #1E202C;
  margin: 0;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background-color: #E4E6EB;
  border-radius: 8px;
  padding: 6px 12px;
  width: 100%;
}

.search-icon {
  color: #5F6173;
  margin-right: 8px;
  font-size: 18px;
}

.search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13.5px;
  color: #1E202C;
  width: 100%;
}

.dh-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}

.action-btn {
  background-color: #ffffff;
  border: 1px solid #d4d8de;
  border-radius: 8px;
  padding: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: #1E202C;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.dh-actions .action-btn:first-child {
  flex-shrink: 0;
  width: 40px;
}

.primary-btn {
  background-color: #EBF3FF;
  border-color: #2F80ED;
  color: #2F80ED;
  flex-grow: 1;
}

.primary-btn:hover {
  background-color: #d2e6ff;
}

/* Filter Info Bar */
.filter-info-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #ffffff;
  border: 1px solid #EAECEF;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #5F6173;
  font-weight: 600;
  margin-bottom: 16px;
}

.count-badge {
  background-color: #EBF3FF;
  color: #2F80ED;
  border-radius: 12px;
  padding: 2px 8px;
  font-weight: 700;
}

/* Accounts List */
.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-card {
  background: #ffffff;
  border: 1px solid #EAECEF;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

button.account-card {
  width: 100%;
  font: inherit;
  text-align: left;
}

.account-card:active {
  transform: scale(0.98);
  background-color: #F7F8FC;
}

.card-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.card-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
}

.all-avatar {
  background-color: #EBF3FF;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-info {
  flex-grow: 1;
  min-width: 0;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: #1E202C;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-sub {
  font-size: 11.5px;
  color: #5F6173;
  margin-top: 2px;
  display: flex;
  align-items: center;
}

.platform-name {
  font-weight: 600;
}

.phone-sub {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status Indicators */
.status-indicator {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 12px;
  flex-shrink: 0;
}

.status-indicator.connected {
  background-color: #E6F8F3;
  color: #2EC4B6;
}

.status-indicator.disconnected {
  background-color: #FEECEB;
  color: #FF5A5F;
}

.all-indicator {
  background-color: #EBF3FF;
  color: #2F80ED;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 12px;
}

.all-card {
  border-left: 4px solid #2F80ED;
}

.disconnected-card {
  border-color: #FEECEB;
}

.pancake-card {
  border-style: dashed;
  border-color: #9fc5f8;
}

.pancake-card.pancake-connected {
  border-style: solid;
  border-left: 4px solid #2EC4B6;
}

.pancake-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #EBF3FF;
  color: #0068FF;
}

.status-indicator.pancake-pending {
  background: #FFF6E5;
  color: #B76E00;
}

.spin {
  animation: rotation 1s infinite linear;
}

@keyframes rotation {
  from { transform: rotate(0deg); }
  to { transform: rotate(359deg); }
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #5F6173;
  font-size: 13.5px;
}

/* Responsive Desktop styles override */
@media (min-width: 600px) {
  .select-account-container {
    padding: 24px 32px;
    max-width: 680px;
    margin: 0 auto;
  }

  .dashboard-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .dh-title-section {
    flex-direction: row;
    align-items: center;
    gap: 20px;
  }

  .search-box {
    width: 260px;
  }

  .dh-actions {
    width: auto;
  }

  .dh-actions .action-btn:first-child {
    width: auto;
  }

  .primary-btn {
    flex-grow: 0;
  }

  .account-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
    border-color: #2F80ED;
  }
}
</style>
