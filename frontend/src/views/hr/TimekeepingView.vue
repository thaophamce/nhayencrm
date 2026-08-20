<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  TimekeepingView.vue — /timekeeping. Layout cột tab dọc bên trái (đồng bộ OrdersView).
   • Chấm công — dashboard (thẻ số liệu + ca hôm nay + lịch sử tuần) — mọi user.
   • Lịch sử của tôi — bảng theo tháng.
   • Toàn công ty — gated attendance.view_all.
   • Nghỉ phép — form gửi đơn (mọi user).
   • Duyệt nghỉ phép — gated leave.view_all.
   • Cấu hình — admin/owner.
-->
<template>
  <div class="tk-shell">
    <!-- Header liền mạch -->
    <div class="tk-topbar">
      <div>
        <h1 class="tk-title">Chấm công</h1>
        <p class="tk-subtitle">Tự chấm công theo ca, theo dõi lịch sử và quản lý nghỉ phép.</p>
      </div>
    </div>

    <div class="tk-body">
      <!-- Cột tab dọc bên trái -->
      <aside class="tk-sidebar">
        <nav class="tk-nav">
          <button
            v-for="t in visibleTabs"
            :key="t.value"
            class="tk-nav-link"
            :class="{ 'is-active': activeTab === t.value }"
            @click="activeTab = t.value"
          >
            <v-icon :icon="t.icon" size="18" class="tk-nav-icon" />
            <span>{{ t.label }}</span>
          </button>
        </nav>
      </aside>

      <!-- Nội dung tab -->
      <main class="tk-content">
        <AttendanceDashboard v-if="activeTab === 'checkin'" />
        <AttendanceHistoryTable v-else-if="activeTab === 'mine'" mode="me" />
        <AttendanceHistoryTable v-else-if="activeTab === 'company'" mode="all" />
        <LeaveRequestForm v-else-if="activeTab === 'leave'" />
        <LeaveAdminTable v-else-if="activeTab === 'leaveAdmin'" />
        <AttendanceConfigForm v-else-if="activeTab === 'config'" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import AttendanceDashboard from '@/components/hr/AttendanceDashboard.vue';
import AttendanceHistoryTable from '@/components/hr/AttendanceHistoryTable.vue';
import LeaveRequestForm from '@/components/hr/LeaveRequestForm.vue';
import LeaveAdminTable from '@/components/hr/LeaveAdminTable.vue';
import AttendanceConfigForm from '@/components/hr/AttendanceConfigForm.vue';

const authStore = useAuthStore();
const canViewAll = authStore.canAccess('attendance', 'view_all');
const canReviewLeave = authStore.canAccess('leave', 'view_all');
const canConfig = authStore.isOwner || authStore.isAdmin || authStore.canAccess('attendance', 'view_all');

const activeTab = ref('checkin');

const visibleTabs = computed(() =>
  [
    { value: 'checkin', icon: 'mdi-clock-check-outline', label: 'Chấm công', show: true },
    { value: 'mine', icon: 'mdi-history', label: 'Lịch sử của tôi', show: true },
    { value: 'company', icon: 'mdi-account-group-outline', label: 'Toàn công ty', show: canViewAll },
    { value: 'leave', icon: 'mdi-calendar-minus-outline', label: 'Nghỉ phép', show: true },
    { value: 'leaveAdmin', icon: 'mdi-calendar-check-outline', label: 'Duyệt đơn', show: canReviewLeave },
    { value: 'config', icon: 'mdi-cog-outline', label: 'Cấu hình', show: canConfig },
  ].filter((t) => t.show),
);
</script>

<style scoped>
.tk-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--smax-topnav-h, 48px));
  min-height: 0;
  overflow: hidden;
  background: #1A6FD4;
}
.tk-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 24px;
  background: #ffffff;
  border-bottom: 1px solid #eaecef;
  flex: 0 0 auto;
}
.tk-title {
  font-size: 20px;
  font-weight: 700;
  color: #1e202c;
  margin: 0;
}
.tk-subtitle {
  font-size: 12.5px;
  color: #5f6173;
  margin: 2px 0 0;
}
.tk-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
.tk-sidebar {
  flex: 0 0 220px;
  border-right: 1px solid rgba(255, 255, 255, 0.16);
  background: #1A6FD4;
  padding: 12px 8px;
  overflow-y: auto;
}
.tk-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tk-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.tk-nav-link:hover {
  background: rgba(255, 255, 255, 0.12);
}
.tk-nav-link.is-active {
  background: rgba(255, 255, 255, 0.20);
  color: #ffffff;
  box-shadow: inset 3px 0 0 #ffffff;
  font-weight: 700;
}
.tk-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  background: #f7f8fc;
  border-top-left-radius: 24px;
}
@media (max-width: 768px) {
  .tk-body {
    flex-direction: column;
  }
  .tk-sidebar {
    flex: 0 0 auto;
    border-right: none;
    border-bottom: 1px solid #eaecef;
  }
  .tk-content { border-top-left-radius: 0; }
  .tk-nav {
    flex-direction: row;
    overflow-x: auto;
  }
}
</style>
