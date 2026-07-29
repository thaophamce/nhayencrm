<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="cl-mobile-dash pa-3" style="min-height: calc(100vh - 120px); background: #F8FAFC;">
    <!-- Welcome Header -->
    <div class="d-flex align-center justify-between mb-4 px-1">
      <div class="text-left">
        <div class="text-h5 font-weight-bold text-slate-900" style="font-family: 'Quicksand', sans-serif;">
          Xin chào, {{ userName }} 👋
        </div>
        <div class="text-caption text-slate-500">Chúc bạn một ngày làm việc hiệu quả!</div>
      </div>
      <v-avatar size="42" class="border">
        <v-icon color="primary" size="30">mdi-account-circle</v-icon>
      </v-avatar>
    </div>

    <!-- 4 KPI Cards Grid -->
    <div class="grid-2-cols gap-3 mb-4">
      <v-card class="cl-kpi-card" flat>
        <span class="cl-kpi-label">Cần rep</span>
        <span class="cl-kpi-value text-red">{{ stats.unreplied }}</span>
        <span class="text-caption text-slate-400">Khách hàng</span>
      </v-card>

      <v-card class="cl-kpi-card" flat>
        <span class="cl-kpi-label">Đơn hàng mới</span>
        <span class="cl-kpi-value text-success">{{ stats.newOrders }}</span>
        <span class="text-caption text-slate-400">Đơn hàng</span>
      </v-card>

      <v-card class="cl-kpi-card" flat>
        <span class="cl-kpi-label">Đang thiết kế</span>
        <span class="cl-kpi-value text-warning">{{ stats.designing }}</span>
        <span class="text-caption text-slate-400">Đơn</span>
      </v-card>

      <v-card class="cl-kpi-card" flat>
        <span class="cl-kpi-label">Chốt in hôm nay</span>
        <span class="cl-kpi-value text-primary">{{ stats.approved }}</span>
        <span class="text-caption text-slate-400">Đơn</span>
      </v-card>
    </div>

    <!-- Revenue Card with SVG Mini Chart -->
    <v-card class="cl-chart-card mb-4" flat>
      <div class="pa-4">
        <span class="cl-kpi-label">Doanh thu hôm nay</span>
        <div class="d-flex align-baseline gap-2 mt-1">
          <span class="text-h6 font-weight-bold text-slate-900">{{ formatCurrency(revenueToday) }}</span>
          <span class="text-caption font-weight-bold text-green">+24% so với hôm qua</span>
        </div>

        <!-- SVG Line chart (Micro-chart) -->
        <div class="cl-micro-chart mt-4">
          <svg viewBox="0 0 300 80" class="w-100 h-auto">
            <!-- Gradient background -->
            <defs>
              <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#2563EB" stop-opacity="0.25" />
                <stop offset="100%" stop-color="#2563EB" stop-opacity="0" />
              </linearGradient>
            </defs>
            <!-- Area under the curve -->
            <path
              d="M 0 80 Q 50 40 100 50 T 200 20 T 300 10 L 300 80 Z"
              fill="url(#chart-grad)"
            />
            <!-- The line -->
            <path
              d="M 0 80 Q 50 40 100 50 T 200 20 T 300 10"
              fill="none"
              stroke="#2563EB"
              stroke-width="3.5"
              stroke-linecap="round"
            />
            <!-- Dots -->
            <circle cx="100" cy="50" r="4" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" />
            <circle cx="200" cy="20" r="4" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" />
            <circle cx="300" cy="10" r="4" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" />
          </svg>
          <div class="d-flex justify-between text-caption text-slate-400 mt-2">
            <span>00:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>
    </v-card>

    <!-- Need Reply List -->
    <v-card class="cl-section-card mb-4" flat>
      <div class="pa-4 border-b d-flex justify-between align-center">
        <span class="text-subtitle-2 font-weight-bold text-slate-800">Cần rep ngay</span>
        <span class="text-caption text-primary font-weight-bold cursor-pointer" @click="goToChat">
          Xem tất cả ({{ stats.unreplied }})
        </span>
      </div>
      <v-list class="pa-0">
        <v-list-item
          v-for="item in needReplyList.slice(0, 3)"
          :key="item.id"
          class="border-b px-4 py-2"
          @click="openChat(item.conversationId || item.id)"
        >
          <template v-slot:prepend>
            <v-avatar size="36" class="mr-3">
              <v-img v-if="item.avatar" :src="item.avatar" />
              <v-icon v-else size="32" color="grey-darken-1">mdi-account-circle</v-icon>
            </v-avatar>
          </template>
          <v-list-item-title class="text-body-2 font-weight-bold text-slate-900">{{ item.fullName }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption text-slate-500 text-truncate">{{ item.lastMessageText || 'Tin nhắn mới' }}</v-list-item-subtitle>
          <template v-slot:append>
            <v-chip size="x-small" color="error" class="font-weight-bold text-white" variant="flat">
              {{ item.unreadCount || 1 }}
            </v-chip>
          </template>
        </v-list-item>
        <div v-if="needReplyList.length === 0" class="text-center py-6 text-slate-400 text-body-2">
          Tuyệt vời! Không có tin nhắn chờ.
        </div>
      </v-list>
    </v-card>

    <!-- Tasks List -->
    <v-card class="cl-section-card" flat>
      <div class="pa-4 border-b">
        <span class="text-subtitle-2 font-weight-bold text-slate-800">Công việc hôm nay</span>
      </div>
      <v-list class="pa-0">
        <v-list-item
          v-for="task in todayTasks"
          :key="task.id"
          class="border-b px-4 py-3 d-flex align-center"
        >
          <template v-slot:prepend>
            <v-icon color="primary" class="mr-3">mdi-calendar-check</v-icon>
          </template>
          <div>
            <div class="text-body-2 font-weight-bold text-slate-900">{{ task.title || 'Lịch hẹn chăm sóc' }}</div>
            <div class="text-caption text-slate-500">⏰ {{ task.time || 'Cả ngày' }} • Khách hàng: {{ task.contactName || 'Không rõ' }}</div>
          </div>
        </v-list-item>
        <div v-if="todayTasks.length === 0" class="text-center py-6 text-slate-400 text-body-2">
          Hôm nay không có lịch nhắc việc nào.
        </div>
      </v-list>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useDashboardActionHub } from '@/composables/use-dashboard-action-hub';

const router = useRouter();
const authStore = useAuthStore();
const hub = useDashboardActionHub();

const revenueToday = ref(12450000); // 12,450,000 VND
const needReplyList = ref<any[]>([]);
const todayTasks = ref<any[]>([]);

const userName = computed(() => authStore.user?.fullName || 'Thảo');

const stats = computed(() => {
  const meData = hub.me.value;
  return {
    unreplied: meData?.kpi?.unreplied?.public || 0,
    newOrders: meData?.sessions?.active || 0,
    designing: meData?.sessions?.paused || 0,
    approved: meData?.sessions?.closedThisMonth || 0,
  };
});

async function loadDashboardData() {
  try {
    await hub.fetchMe();

    const meData = hub.me.value;
    if (meData) {
      // Extract unreplied contacts from urgent list
      needReplyList.value = (meData.urgent || []).map((c: any) => ({
        id: c.conversationId,
        fullName: c.contactName || 'Khách hàng Zalo',
        avatar: c.contactAvatar,
        lastMessageText: c.messagePreview || 'Tin nhắn mới nhận',
        unreadCount: c.unreadCount || 1,
        conversationId: c.conversationId
      }));

      // Extract today tasks
      const todayReminders = meData.reminders?.today || [];
      todayTasks.value = todayReminders.map((r: any) => ({
        id: r.id,
        title: r.title || 'Lịch hẹn chăm sóc khách',
        time: r.appointmentTime || 'Cả ngày',
        contactName: r.contactName || 'Không rõ'
      }));
    }
  } catch (err) {
    console.error('Load mobile dashboard data error:', err);
  }
}

function openChat(convId: string) {
  if (convId) {
    router.push({ name: 'Chat', query: { id: convId } });
  }
}

function goToChat() {
  router.push('/chat');
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}

onMounted(() => {
  loadDashboardData();
});
</script>

<style scoped>
.cl-mobile-dash {
  display: flex;
  flex-direction: column;
}
.grid-2-cols {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
}
.gap-3 {
  gap: 12px;
}
.cl-kpi-card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.theme--dark .cl-kpi-card {
  background: #1E293B;
  border-color: #334155;
}
.cl-kpi-label {
  font-size: 12px;
  color: #64748B;
  font-weight: 600;
}
.cl-kpi-value {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.2;
  margin: 4px 0;
  font-family: 'Quicksand', sans-serif;
}
.cl-chart-card {
  background: #FFFFFF;
  border-radius: 18px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
}
.theme--dark .cl-chart-card {
  background: #1E293B;
  border-color: #334155;
}
.cl-section-card {
  background: #FFFFFF;
  border-radius: 18px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
  overflow: hidden;
}
.theme--dark .cl-section-card {
  background: #1E293B;
  border-color: #334155;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
