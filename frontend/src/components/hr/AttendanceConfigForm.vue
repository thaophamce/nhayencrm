<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  AttendanceConfigForm.vue — cấu hình chấm công (admin/owner).
  IP cho phép, giờ 3 ca, grace, công chuẩn, mức bảo hiểm.
  Đọc/ghi GET/PUT /attendance/config.
-->
<template>
  <div>
    <v-alert type="info" variant="tonal" density="comfortable" class="mb-4">
      <v-icon start icon="mdi-information-outline" />
      Nhân viên chỉ chấm công được khi IP nằm trong danh sách cho phép.
      Để trống danh sách IP = cho phép mọi IP.
    </v-alert>

    <v-card variant="outlined" class="mb-4 config-card">
      <v-card-title class="text-subtitle-1 font-weight-bold">
        <v-icon start icon="mdi-wifi" size="20" />IP / WiFi cho phép
      </v-card-title>
      <v-card-text>
        <v-combobox
          v-model="form.allowedIps"
          label="Danh sách IP (Enter để thêm)"
          variant="outlined"
          multiple
          chips
          closable-chips
          hint="VD: 113.161.xx.xx — IP công khai của WiFi công ty"
          persistent-hint
        />
      </v-card-text>
    </v-card>

    <v-card variant="outlined" class="mb-4 config-card">
      <v-card-title class="text-subtitle-1 font-weight-bold">
        <v-icon start icon="mdi-clock-outline" size="20" />Giờ ca &amp; dung sai
      </v-card-title>
      <v-card-text>
        <v-row v-for="s in SHIFTS" :key="s.key" dense align="center" class="shift-row">
          <v-col cols="12" sm="4" class="text-body-2 font-weight-medium">
            <v-icon :icon="s.icon" size="18" class="mr-1" />{{ s.label }}
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field v-model="form.shifts[s.key].start" type="time" label="Bắt đầu" variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field v-model="form.shifts[s.key].end" type="time" label="Kết thúc" variant="outlined" density="compact" hide-details />
          </v-col>
        </v-row>
        <v-row dense class="mt-3">
          <v-col cols="6" sm="4">
            <v-text-field v-model.number="form.graceMinutes" type="number" label="Dung sai trễ (phút)" variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field v-model.number="form.workingDaysPerMonth" type="number" label="Công chuẩn / tháng" variant="outlined" density="compact" hide-details />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card variant="outlined" class="mb-4 config-card">
      <v-card-title class="text-subtitle-1 font-weight-bold">
        <v-icon start icon="mdi-shield-check-outline" size="20" />Mức bảo hiểm (trừ khi tham gia)
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="4">
            <v-text-field v-model.number="form.insurance.bhxh" type="number" label="BHXH" variant="outlined" density="compact" hide-details suffix="đ" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model.number="form.insurance.bhyt" type="number" label="BHYT" variant="outlined" density="compact" hide-details suffix="đ" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model.number="form.insurance.bhtn" type="number" label="BHTN" variant="outlined" density="compact" hide-details suffix="đ" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <div class="d-flex">
      <v-spacer />
      <v-btn color="primary" variant="flat" :loading="saving" prepend-icon="mdi-content-save" @click="save">
        Lưu cấu hình
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { SHIFTS, type ShiftKey } from '@/constants/hr';

const toast = useToast();
const saving = ref(false);

const form = reactive<{
  allowedIps: string[];
  shifts: Record<ShiftKey, { start: string; end: string }>;
  graceMinutes: number;
  workingDaysPerMonth: number;
  insurance: { bhxh: number; bhyt: number; bhtn: number };
}>({
  allowedIps: [],
  shifts: {
    morning: { start: '07:30', end: '11:30' },
    afternoon: { start: '13:30', end: '17:30' },
    overtime: { start: '19:30', end: '22:00' },
  },
  graceMinutes: 15,
  workingDaysPerMonth: 26,
  insurance: { bhxh: 456000, bhyt: 85500, bhtn: 57000 },
});

async function load() {
  try {
    const res = await api.get('/attendance/config');
    const c = res.data ?? {};
    if (Array.isArray(c.allowedIps)) form.allowedIps = c.allowedIps;
    if (c.shifts) {
      for (const k of Object.keys(form.shifts) as ShiftKey[]) {
        if (c.shifts[k]) form.shifts[k] = { start: c.shifts[k].start, end: c.shifts[k].end };
      }
    }
    if (typeof c.graceMinutes === 'number') form.graceMinutes = c.graceMinutes;
    if (typeof c.workingDaysPerMonth === 'number') form.workingDaysPerMonth = c.workingDaysPerMonth;
    if (c.insurance) form.insurance = { ...form.insurance, ...c.insurance };
  } catch {
    /* dùng mặc định */
  }
}

async function save() {
  saving.value = true;
  try {
    await api.put('/attendance/config', {
      allowedIps: form.allowedIps,
      shifts: form.shifts,
      graceMinutes: form.graceMinutes,
      workingDaysPerMonth: form.workingDaysPerMonth,
      insurance: form.insurance,
    });
    toast.success('Đã lưu cấu hình chấm công');
  } catch (err: any) {
    toast.error(err?.response?.data?.hint || err?.response?.data?.error || 'Lưu thất bại');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.config-card {
  border: 1px solid #eaecef;
  border-radius: 12px;
}
.shift-row {
  padding: 6px 0;
  border-bottom: 1px solid #f7f8fc;
}
.shift-row:last-child {
  border-bottom: none;
}
</style>
