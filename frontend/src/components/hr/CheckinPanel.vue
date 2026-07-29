<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  CheckinPanel.vue — tự chấm công. 3 nút ca; trễ → modal nhập lý do.
  Server xác thực IP + tính status/lateMinutes; component chỉ gửi { shift, lateReason }.
-->
<template>
  <div>
    <v-alert v-if="ipError" type="error" variant="tonal" class="mb-4" density="comfortable">
      {{ ipError }}
    </v-alert>

    <div class="checkin-header">
      <div class="checkin-date">{{ todayLabel }}</div>
      <div class="checkin-prompt">Chọn ca để chấm công</div>
    </div>

    <v-row dense>
      <v-col v-for="s in SHIFTS" :key="s.key" cols="12" sm="4">
        <div
          class="shift-card"
          :class="{
            'shift-card--done': doneShifts.has(s.key),
            'shift-card--morning': s.key === 'morning',
            'shift-card--afternoon': s.key === 'afternoon',
            'shift-card--overtime': s.key === 'overtime',
          }"
        >
          <div class="shift-icon">
            <v-icon :icon="s.icon" size="32" />
          </div>
          <div class="shift-info">
            <div class="shift-label">{{ s.label }}</div>
            <div class="shift-time">{{ shiftTime(s.key) }}</div>
          </div>
          <div class="shift-action">
            <v-chip v-if="doneShifts.has(s.key)" color="success" size="small" variant="flat" class="shift-badge">
              <v-icon start icon="mdi-check" size="16" />Đã chấm
            </v-chip>
            <v-btn
              v-else
              color="primary"
              variant="flat"
              :loading="submitting === s.key"
              size="small"
              @click="attemptCheckin(s.key)"
            >
              Chấm công
            </v-btn>
          </div>
        </div>
      </v-col>
    </v-row>

    <!-- Modal nhập lý do khi trễ -->
    <v-dialog v-model="lateDialog" max-width="440" persistent>
      <v-card>
        <v-card-title class="text-warning">
          <v-icon start icon="mdi-clock-alert-outline" />Đi trễ
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            Bạn đang chấm công <strong>{{ pendingShiftLabel }}</strong> trễ.
            Vui lòng nhập lý do:
          </p>
          <v-textarea
            v-model="lateReason"
            label="Lý do đi trễ"
            variant="outlined"
            rows="3"
            auto-grow
            autofocus
            :error-messages="lateReasonError"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelLate">Huỷ</v-btn>
          <v-btn color="primary" variant="flat" :loading="submitting !== null" @click="confirmLate">
            Xác nhận
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { SHIFTS, SHIFT_LABEL, currentDate, currentPeriod, type ShiftKey } from '@/constants/hr';

const emit = defineEmits<{ (e: 'checked-in'): void }>();
const toast = useToast();

const config = ref<any>(null);
const doneShifts = ref<Set<string>>(new Set());
const submitting = ref<ShiftKey | null>(null);
const ipError = ref('');

const lateDialog = ref(false);
const lateReason = ref('');
const lateReasonError = ref('');
const pendingShift = ref<ShiftKey | null>(null);

const todayLabel = computed(() => {
  const [y, m, d] = currentDate().split('-');
  return `${d}/${m}/${y}`;
});
const pendingShiftLabel = computed(() => (pendingShift.value ? SHIFT_LABEL[pendingShift.value] : ''));

function shiftTime(key: ShiftKey): string {
  const s = config.value?.shifts?.[key];
  return s ? `${s.start} – ${s.end}` : '';
}

async function loadConfig() {
  try {
    const res = await api.get('/attendance/config');
    config.value = res.data;
  } catch {
    /* dùng label trống nếu lỗi */
  }
}

async function loadToday() {
  try {
    const res = await api.get('/attendance/me', { params: { month: currentPeriod() } });
    const today = currentDate();
    const set = new Set<string>();
    for (const r of res.data.records ?? []) {
      if (r.date === today) set.add(r.shift);
    }
    doneShifts.value = set;
  } catch {
    /* ignore */
  }
}

async function attemptCheckin(shift: ShiftKey, lateReasonValue?: string) {
  submitting.value = shift;
  ipError.value = '';
  try {
    await api.post('/attendance/checkin', { shift, lateReason: lateReasonValue });
    toast.success('Chấm công thành công');
    doneShifts.value = new Set([...doneShifts.value, shift]);
    lateDialog.value = false;
    lateReason.value = '';
    pendingShift.value = null;
    emit('checked-in');
  } catch (err: any) {
    const data = err?.response?.data;
    if (data?.error === 'late_reason_required') {
      // Mở modal nhập lý do.
      pendingShift.value = shift;
      lateDialog.value = true;
    } else if (data?.error === 'ip_not_allowed') {
      ipError.value = `${data.hint || 'IP không được phép chấm công'} (IP của bạn: ${data.clientIp || '?'})`;
    } else if (data?.error === 'already_checked_in') {
      toast.warning('Bạn đã chấm công ca này rồi');
      doneShifts.value = new Set([...doneShifts.value, shift]);
    } else {
      toast.error(data?.hint || data?.error || 'Chấm công thất bại');
    }
  } finally {
    submitting.value = null;
  }
}

function confirmLate() {
  if (!lateReason.value.trim()) {
    lateReasonError.value = 'Nhập lý do đi trễ';
    return;
  }
  lateReasonError.value = '';
  if (pendingShift.value) attemptCheckin(pendingShift.value, lateReason.value.trim());
}

function cancelLate() {
  lateDialog.value = false;
  lateReason.value = '';
  lateReasonError.value = '';
  pendingShift.value = null;
}

onMounted(() => {
  loadConfig();
  loadToday();
});
</script>

<style scoped>
.checkin-header {
  margin-bottom: 20px;
  text-align: center;
}
.checkin-date {
  font-size: 18px;
  font-weight: 700;
  color: #1e202c;
  margin-bottom: 4px;
}
.checkin-prompt {
  font-size: 13px;
  color: #5f6173;
}

.shift-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px;
  border-radius: 12px;
  background: #ffffff;
  border: 2px solid #eaecef;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
.shift-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: #eaecef;
  transition: all 0.2s ease;
}
.shift-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(47, 128, 237, 0.12);
  border-color: #2f80ed;
}
.shift-card:hover::before {
  height: 5px;
}
.shift-card--morning::before {
  background: linear-gradient(90deg, #ff9f1c 0%, #f58b00 100%);
}
.shift-card--afternoon::before {
  background: linear-gradient(90deg, #2f80ed 0%, #1a6fd4 100%);
}
.shift-card--overtime::before {
  background: linear-gradient(90deg, #5f6173 0%, #44505c 100%);
}
.shift-card--done {
  background: #f0fdf4;
  border-color: #2ec4b6;
}
.shift-card--done::before {
  background: linear-gradient(90deg, #2ec4b6 0%, #22a69a 100%);
  height: 5px;
}

.shift-icon {
  text-align: center;
  color: #5f6173;
}
.shift-card--morning .shift-icon {
  color: #ff9f1c;
}
.shift-card--afternoon .shift-icon {
  color: #2f80ed;
}
.shift-card--overtime .shift-icon {
  color: #5f6173;
}
.shift-card--done .shift-icon {
  color: #2ec4b6;
}

.shift-info {
  text-align: center;
}
.shift-label {
  font-size: 15px;
  font-weight: 700;
  color: #1e202c;
  margin-bottom: 4px;
}
.shift-time {
  font-size: 12px;
  color: #8a8d9c;
}

.shift-action {
  display: flex;
  justify-content: center;
}
.shift-badge {
  font-weight: 600;
  letter-spacing: 0.3px;
}
</style>