<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  LeaveRequestForm.vue — gửi đơn nghỉ phép + danh sách đơn của tôi.
  Nghỉ phép KHÔNG tự trừ chấm công/lương (chỉ ghi nhận + duyệt).
-->
<template>
  <div>
    <v-card variant="outlined" class="mb-6 leave-form-card">
      <v-card-title class="text-subtitle-1 font-weight-bold">Gửi đơn nghỉ phép</v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.type"
              :items="LEAVE_TYPES"
              item-title="label"
              item-value="value"
              label="Loại nghỉ"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.session"
              :items="LEAVE_SESSIONS"
              item-title="label"
              item-value="value"
              label="Buổi"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.startDate"
              type="date"
              label="Từ ngày"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.endDate"
              type="date"
              label="Đến ngày"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12">
            <v-textarea
              v-model="form.reason"
              label="Lý do"
              variant="outlined"
              rows="2"
              auto-grow
              :error-messages="formError"
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn color="primary" variant="flat" :loading="submitting" prepend-icon="mdi-send" @click="submit">
          Gửi đơn
        </v-btn>
      </v-card-actions>
    </v-card>

    <div class="d-flex align-center mb-3">
      <div class="text-subtitle-2 font-weight-bold">Đơn nghỉ của tôi</div>
      <v-spacer />
      <v-chip variant="tonal" color="primary" prepend-icon="mdi-file-document-multiple-outline" size="small">
        {{ myLeaves.length }} đơn
      </v-chip>
    </div>
    <v-data-table
      :headers="headers"
      :items="myLeaves"
      :loading="loading"
      density="comfortable"
      :items-per-page="10"
      no-data-text="Chưa có đơn nghỉ nào"
      class="leave-table"
    >
      <template #[`item.type`]="{ item }">{{ LEAVE_TYPE_LABEL[item.type] || item.type }}</template>
      <template #[`item.session`]="{ item }">{{ LEAVE_SESSION_LABEL[item.session] || item.session }}</template>
      <template #[`item.range`]="{ item }">
        {{ formatDate(item.startDate) }}<span v-if="item.endDate !== item.startDate"> – {{ formatDate(item.endDate) }}</span>
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip :color="LEAVE_STATUS[item.status]?.color" size="small" variant="tonal">
          {{ LEAVE_STATUS[item.status]?.label || item.status }}
        </v-chip>
      </template>
      <template #[`item.reviewNote`]="{ item }">
        <span class="text-caption">{{ item.reviewNote || '' }}</span>
      </template>
    </v-data-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import {
  LEAVE_TYPES,
  LEAVE_SESSIONS,
  LEAVE_TYPE_LABEL,
  LEAVE_SESSION_LABEL,
  LEAVE_STATUS,
  currentDate,
} from '@/constants/hr';

const toast = useToast();

const form = reactive({
  type: 'normal',
  session: 'full',
  startDate: currentDate(),
  endDate: currentDate(),
  reason: '',
});
const formError = ref('');
const submitting = ref(false);

const myLeaves = ref<any[]>([]);
const loading = ref(false);

const headers = [
  { title: 'Loại', key: 'type', width: 140 },
  { title: 'Buổi', key: 'session', width: 110 },
  { title: 'Thời gian', key: 'range', width: 180 },
  { title: 'Lý do', key: 'reason' },
  { title: 'Trạng thái', key: 'status', width: 120 },
  { title: 'Ghi chú duyệt', key: 'reviewNote' },
];

function formatDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

async function loadMine() {
  loading.value = true;
  try {
    const res = await api.get('/leave/me');
    myLeaves.value = res.data.records ?? res.data.leaves ?? [];
  } catch {
    myLeaves.value = [];
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!form.reason.trim()) {
    formError.value = 'Nhập lý do nghỉ';
    return;
  }
  if (form.endDate < form.startDate) {
    formError.value = 'Ngày kết thúc phải ≥ ngày bắt đầu';
    return;
  }
  formError.value = '';
  submitting.value = true;
  try {
    await api.post('/leave', {
      type: form.type,
      session: form.session,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason.trim(),
    });
    toast.success('Đã gửi đơn nghỉ phép');
    form.reason = '';
    await loadMine();
  } catch (err: any) {
    toast.error(err?.response?.data?.hint || err?.response?.data?.error || 'Gửi đơn thất bại');
  } finally {
    submitting.value = false;
  }
}

onMounted(loadMine);
</script>

<style scoped>
.leave-form-card {
  border: 1px solid #eaecef;
  border-radius: 12px;
}
.leave-table :deep(.v-data-table__wrapper) {
  border: 1px solid #eaecef;
  border-radius: 12px;
}
</style>
