<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  AttendanceHistoryTable.vue — lịch sử chấm công theo tháng.
  Dùng chung: mode="me" (của tôi) đọc /attendance/me; mode="all" (toàn công ty)
  đọc /attendance với filter userId tuỳ chọn.
-->
<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-3 mb-4">
      <v-text-field
        v-model="month"
        type="month"
        label="Tháng"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 200px"
        @update:model-value="load"
      />
      <v-select
        v-if="mode === 'all'"
        v-model="userId"
        :items="userItems"
        item-title="label"
        item-value="value"
        label="Nhân viên"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        style="max-width: 260px"
        @update:model-value="load"
      />
      <v-spacer />
      <v-chip variant="tonal" color="primary" prepend-icon="mdi-calendar-check">
        {{ records.length }} lượt chấm công
      </v-chip>
    </div>

    <v-data-table
      :headers="headers"
      :items="records"
      :loading="loading"
      density="comfortable"
      :items-per-page="25"
      no-data-text="Chưa có dữ liệu chấm công"
      class="attendance-table"
    >
      <template #[`item.date`]="{ item }">
        {{ formatDate(item.date) }}
      </template>
      <template #[`item.user`]="{ item }">
        {{ item.user?.fullName || item.user?.email || '—' }}
      </template>
      <template #[`item.shift`]="{ item }">
        <v-chip size="small" variant="tonal" :color="getShiftColor(item.shift)">
          {{ SHIFT_LABEL[item.shift] || item.shift }}
        </v-chip>
      </template>
      <template #[`item.checkinTime`]="{ item }">
        <span class="checkin-time">{{ formatTime(item.checkinTime) }}</span>
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip :color="ATTENDANCE_STATUS[item.status]?.color" size="small" variant="tonal">
          {{ ATTENDANCE_STATUS[item.status]?.label || item.status }}
          <span v-if="item.status === 'late' && item.lateMinutes"> · {{ item.lateMinutes }}′</span>
        </v-chip>
      </template>
      <template #[`item.lateReason`]="{ item }">
        <span class="text-caption text-medium-emphasis">{{ item.lateReason || '' }}</span>
      </template>
    </v-data-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';
import { SHIFT_LABEL, ATTENDANCE_STATUS, currentPeriod } from '@/constants/hr';

const props = withDefaults(defineProps<{ mode?: 'me' | 'all' }>(), { mode: 'me' });

const month = ref(currentPeriod());
const userId = ref<string | null>(null);
const records = ref<any[]>([]);
const users = ref<any[]>([]);
const loading = ref(false);

const headers = computed(() => {
  const base: any[] = [{ title: 'Ngày', key: 'date', width: 120 }];
  if (props.mode === 'all') base.push({ title: 'Nhân viên', key: 'user' });
  base.push(
    { title: 'Ca', key: 'shift', width: 120 },
    { title: 'Giờ chấm', key: 'checkinTime', width: 110 },
    { title: 'Trạng thái', key: 'status', width: 160 },
    { title: 'Lý do trễ', key: 'lateReason' },
  );
  return base;
});

const userItems = computed(() =>
  users.value.map((u) => ({ value: u.id, label: u.fullName || u.email })),
);

function formatDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  const vn = new Date(dt.getTime() + 7 * 60 * 60 * 1000);
  return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`;
}

function getShiftColor(shift: string): string {
  if (shift === 'morning') return 'warning';
  if (shift === 'afternoon') return 'primary';
  if (shift === 'overtime') return 'grey';
  return 'default';
}

async function load() {
  loading.value = true;
  try {
    if (props.mode === 'me') {
      const res = await api.get('/attendance/me', { params: { month: month.value } });
      records.value = res.data.records ?? [];
    } else {
      const params: Record<string, string> = { month: month.value };
      if (userId.value) params.userId = userId.value;
      const res = await api.get('/attendance', { params });
      records.value = res.data.records ?? [];
    }
  } catch {
    records.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  if (props.mode !== 'all') return;
  try {
    const res = await api.get('/users');
    users.value = res.data.users ?? res.data ?? [];
  } catch {
    users.value = [];
  }
}

onMounted(() => {
  loadUsers();
  load();
});

defineExpose({ load });
</script>

<style scoped>
.attendance-table :deep(.v-data-table__wrapper) {
  border: 1px solid #eaecef;
  border-radius: 12px;
}
.attendance-table :deep(td),
.attendance-table :deep(th) {
  font-size: 13.5px;
}
.checkin-time {
  font-weight: 600;
  color: #2f80ed;
  font-variant-numeric: tabular-nums;
}
</style>
