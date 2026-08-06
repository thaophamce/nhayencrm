<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  SalaryView.vue — /salary (Lương HR, độc lập với "Báo cáo lương designer").
  Layout cột tab dọc bên trái (đồng bộ OrdersView).
   • Admin/manager (payroll.view_all): bảng lương toàn org + override + in phiếu.
   • Member: chỉ xem phiếu lương của mình theo kỳ.
-->
<template>
  <div class="sl-shell">
    <div class="sl-body">
      <!-- Cột tab dọc bên trái -->
      <aside class="sl-sidebar">
        <nav class="sl-nav">
          <button
            v-for="t in visibleTabs"
            :key="t.value"
            class="sl-nav-link"
            :class="{ 'is-active': activeTab === t.value }"
            @click="activeTab = t.value"
          >
            <v-icon :icon="t.icon" size="18" class="sl-nav-icon" />
            <span>{{ t.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="sl-content">
        <!-- Admin: bảng lương toàn org -->
        <AttendanceDashboard v-if="activeTab === 'checkin'" @navigate="handleDashboardNavigate" />
        <AttendanceHistoryTable v-else-if="activeTab === 'attendanceMine'" mode="me" />
        <AttendanceHistoryTable v-else-if="activeTab === 'company'" mode="all" />
        <LeaveRequestForm v-else-if="activeTab === 'leave'" />
        <LeaveAdminTable v-else-if="activeTab === 'leaveAdmin'" />
        <AttendanceConfigForm v-else-if="activeTab === 'config'" />

        <PayrollTable v-else-if="activeTab === 'table' && canViewPayroll" />

        <!-- Phiếu lương của tôi (member, hoặc admin muốn xem của mình) -->
        <div v-else-if="activeTab === 'salaryMine'">
          <div class="d-flex align-center flex-wrap ga-3 mb-4">
            <v-text-field
              v-model="period"
              type="month"
              label="Kỳ lương"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 200px"
              @update:model-value="loadMine"
            />
            <v-spacer />
            <v-btn
              v-if="record"
              color="primary"
              variant="flat"
              prepend-icon="mdi-file-document-outline"
              @click="slipDialog = true"
            >
              Xem phiếu lương
            </v-btn>
          </div>

          <v-card v-if="record" variant="outlined">
            <v-card-text>
              <v-row>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Lương cơ bản</div>
                  <div class="text-subtitle-1 font-weight-medium">{{ formatVnd(record.baseSalary) }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Ngày công</div>
                  <div class="text-subtitle-1 font-weight-medium">{{ record.workDays }} / {{ record.workingDays || 26 }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Tổng thu nhập</div>
                  <div class="text-subtitle-1 font-weight-medium">{{ formatVnd(record.totalSalary) }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                  <div class="text-caption text-medium-emphasis">Thực nhận</div>
                  <div class="text-subtitle-1 font-weight-bold text-primary">{{ formatVnd(record.netSalary) }}</div>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-alert v-else-if="!loading" type="info" variant="tonal">
            Chưa có phiếu lương cho kỳ {{ formatMonthLabel(period) }}.
          </v-alert>

          <PayslipModal v-model="slipDialog" :record="record" :name="myName" :period="period" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { formatVnd, formatMonthLabel, currentPeriod } from '@/constants/hr';
import AttendanceDashboard from '@/components/hr/AttendanceDashboard.vue';
import AttendanceHistoryTable from '@/components/hr/AttendanceHistoryTable.vue';
import LeaveRequestForm from '@/components/hr/LeaveRequestForm.vue';
import LeaveAdminTable from '@/components/hr/LeaveAdminTable.vue';
import AttendanceConfigForm from '@/components/hr/AttendanceConfigForm.vue';
import PayrollTable from '@/components/hr/PayrollTable.vue';
import PayslipModal from '@/components/hr/PayslipModal.vue';

const authStore = useAuthStore();
const canUseAttendance = authStore.canAccess('attendance');
const canViewAttendanceAll = authStore.canAccess('attendance', 'view_all');
const canReviewLeave = authStore.canAccess('leave', 'view_all');
const canConfigAttendance = authStore.isOwner || authStore.isAdmin || canViewAttendanceAll;
const canUsePayroll = authStore.canAccess('payroll');
const canViewPayroll = authStore.canAccess('payroll', 'view_all');

const visibleTabs = computed(() =>
  [
    { value: 'checkin', icon: 'mdi-clock-check-outline', label: 'Chấm công', show: canUseAttendance },
    { value: 'leaveAdmin', icon: 'mdi-calendar-check-outline', label: 'Duyệt nghỉ phép', show: canReviewLeave },
    { value: 'config', icon: 'mdi-cog-outline', label: 'Cấu hình chấm công', show: canConfigAttendance },
    { value: 'table', icon: 'mdi-table-account', label: 'Bảng lương', show: canViewPayroll },
    { value: 'salaryMine', icon: 'mdi-file-document-outline', label: 'Phiếu lương của tôi', show: canUsePayroll },
  ].filter((t) => t.show),
);

import { useRoute } from 'vue-router';

const route = useRoute();
const activeTab = ref((route.query.tab as string) || visibleTabs.value[0]?.value || 'checkin');

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && typeof newTab === 'string') {
      activeTab.value = newTab;
    }
  },
);

function handleDashboardNavigate(target: 'leave' | 'history' | 'payroll') {
  const desired = target === 'leave' ? 'leave' : target === 'history' ? 'attendanceMine' : 'salaryMine';
  if (visibleTabs.value.some((tab) => tab.value === desired)) activeTab.value = desired;
}

const period = ref(currentPeriod());
const record = ref<any>(null);
const loading = ref(false);
const slipDialog = ref(false);
const myName = authStore.user?.fullName || authStore.user?.email || '';

async function loadMine() {
  loading.value = true;
  try {
    const res = await api.get('/payroll/me', { params: { period: period.value } });
    record.value = res.data.record ?? null;
  } catch {
    record.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (canUsePayroll && !canViewPayroll) loadMine();
});
</script>

<style scoped>
.sl-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--smax-topnav-h, 48px));
  min-height: 0;
  overflow: hidden;
  background: #1A6FD4;
}
.sl-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
.sl-sidebar {
  flex: 0 0 220px;
  border-right: 1px solid rgba(255, 255, 255, 0.16);
  background: #1A6FD4;
  padding: 12px 8px;
  overflow-y: auto;
}
.sl-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sl-nav-link {
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
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.sl-nav-link:hover {
  background: rgba(255, 255, 255, 0.12);
}
.sl-nav-link.is-active {
  background: rgba(255, 255, 255, 0.20);
  color: #ffffff;
  box-shadow: inset 3px 0 0 #ffffff;
  font-weight: 700;
}
.sl-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 22px;
  background: #f7f8fc;
  border-top-left-radius: 24px;
}
@media (max-width: 768px) {
  .sl-content { padding: 14px 12px; border-top-left-radius: 0; }
  .sl-body {
    flex-direction: column;
  }
  .sl-sidebar {
    flex: 0 0 auto;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  }
  .sl-nav {
    flex-direction: row;
    overflow-x: auto;
  }
}
</style>
