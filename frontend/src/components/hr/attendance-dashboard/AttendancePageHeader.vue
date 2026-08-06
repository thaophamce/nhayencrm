<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  dateLabel: string;
  period: string;
  network: 'open' | 'unknown' | 'valid' | 'invalid';
  networkDetail?: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:period', value: string): void;
  (e: 'checkin'): void;
}>();

const networkMeta = computed(() => ({
  open: { icon: 'mdi-shield-check-outline', label: 'Không giới hạn IP', cls: 'is-valid' },
  valid: { icon: 'mdi-wifi-check', label: 'IP hợp lệ', cls: 'is-valid' },
  invalid: { icon: 'mdi-wifi-alert', label: 'IP không hợp lệ', cls: 'is-invalid' },
  unknown: { icon: 'mdi-wifi-marker', label: 'Xác minh khi chấm công', cls: 'is-neutral' },
}[props.network]));
</script>

<template>
  <header class="attendance-header">
    <div class="header-copy">
      <h2>Chấm công</h2>
      <p>{{ dateLabel }}</p>
    </div>
    <div class="header-actions">
      <label class="month-picker">
        <v-icon icon="mdi-calendar-month-outline" size="18" />
        <span class="sr-only">Chọn tháng</span>
        <input
          type="month"
          :value="period"
          aria-label="Chọn tháng thống kê"
          @input="emit('update:period', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <div class="network-pill" :class="networkMeta.cls" :title="networkDetail">
        <v-icon :icon="networkMeta.icon" size="18" />
        <span>{{ networkMeta.label }}</span>
      </div>
      <v-btn
        color="primary"
        size="large"
        class="primary-checkin"
        prepend-icon="mdi-fingerprint"
        :disabled="primaryDisabled"
        :loading="primaryLoading"
        @click="emit('checkin')"
      >
        {{ primaryLabel }}
      </v-btn>
    </div>
  </header>
</template>

<style scoped>
.attendance-header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:16px; }
.header-copy h2 { margin:0; color:var(--smax-text); font-size:24px; line-height:1.2; font-weight:750; }
.header-copy p { margin:5px 0 0; color:var(--smax-grey-700); font-size:13px; text-transform:capitalize; }
.header-actions { display:flex; align-items:center; justify-content:flex-end; gap:10px; flex-wrap:wrap; }
.month-picker, .network-pill { min-height:42px; display:inline-flex; align-items:center; gap:8px; border:1px solid var(--smax-grey-200); border-radius:12px; background:#fff; padding:0 12px; color:#374151; }
.month-picker:focus-within { border-color:var(--smax-primary); box-shadow:0 0 0 3px var(--smax-primary-soft); }
.month-picker input { width:118px; border:0; outline:0; background:transparent; color:var(--smax-text); font:600 13px inherit; }
.network-pill { font-size:12.5px; font-weight:650; }
.network-pill.is-valid { color:#147a55; background:#f0fbf6; border-color:#ccefe0; }
.network-pill.is-invalid { color:#c4373e; background:#fff4f4; border-color:#ffd5d7; }
.network-pill.is-neutral { color:#667085; background:#f9fafb; }
.primary-checkin { min-height:42px; padding-inline:18px; font-weight:700; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media (max-width: 900px) { .attendance-header { align-items:flex-start; flex-direction:column; } .header-actions { width:100%; justify-content:flex-start; } }
@media (max-width: 600px) { .attendance-header { margin-bottom:12px; } .header-copy h2 { font-size:21px; } .header-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; } .month-picker,.network-pill { min-width:0; padding:0 10px; } .network-pill span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; } .primary-checkin { grid-column:1/-1; width:100%; min-height:48px; } }
</style>
