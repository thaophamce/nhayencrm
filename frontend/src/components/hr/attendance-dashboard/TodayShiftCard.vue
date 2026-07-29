<script setup lang="ts">
import type { ShiftKey } from '@/constants/hr';

export interface ShiftView {
  key: ShiftKey;
  label: string;
  icon: string;
  time: string;
  state: 'done' | 'late' | 'active' | 'upcoming' | 'ended';
  stateLabel: string;
  checkinLabel?: string;
}

defineProps<{ shifts: ShiftView[]; selected: ShiftKey; submitting?: ShiftKey | null; networkError?: string }>();
const emit = defineEmits<{ (e:'select', value:ShiftKey):void; (e:'checkin', value:ShiftKey):void }>();
</script>

<template>
  <section class="dashboard-card today-card">
    <div class="card-heading">
      <div><h3>Ca hôm nay</h3><p>Chọn ca phù hợp để chấm công</p></div>
      <span class="selected-caption">{{ shifts.find(s => s.key === selected)?.label }}</span>
    </div>

    <div class="shift-list">
      <button
        v-for="shift in shifts"
        :key="shift.key"
        type="button"
        class="shift-row"
        :class="[`state-${shift.state}`, { 'is-selected': selected === shift.key }]"
        :aria-pressed="selected === shift.key"
        @click="emit('select', shift.key)"
      >
        <span class="shift-icon"><v-icon :icon="shift.icon" size="21" /></span>
        <span class="shift-main"><strong>{{ shift.label }}</strong><small>{{ shift.time }}</small></span>
        <span class="shift-meta"><span class="status-badge"><v-icon :icon="shift.state === 'done' ? 'mdi-check' : shift.state === 'late' ? 'mdi-clock-alert-outline' : shift.state === 'active' ? 'mdi-radiobox-marked' : shift.state === 'ended' ? 'mdi-clock-remove-outline' : 'mdi-clock-outline'" size="14" />{{ shift.stateLabel }}</span><small v-if="shift.checkinLabel">{{ shift.checkinLabel }}</small></span>
        <v-icon icon="mdi-chevron-right" size="18" class="chevron" />
      </button>
    </div>

    <div v-if="networkError" class="network-warning" role="alert">
      <v-icon icon="mdi-wifi-alert" size="20" />
      <div><strong>Không thể chấm công từ mạng này</strong><span>{{ networkError }}</span></div>
    </div>
    <div v-else class="network-note">
      <v-icon icon="mdi-shield-check-outline" size="18" />
      <span>Hệ thống xác minh IP tại thời điểm chấm công.</span>
    </div>

    <v-btn
      block color="primary" size="large" class="card-checkin"
      :disabled="['done','late'].includes(shifts.find(s => s.key === selected)?.state || '')"
      :loading="submitting === selected"
      prepend-icon="mdi-fingerprint"
      @click="emit('checkin', selected)"
    >
      {{ ['done','late'].includes(shifts.find(s => s.key === selected)?.state || '') ? 'Ca này đã chấm công' : shifts.find(s => s.key === selected)?.state === 'ended' ? 'Ca đã kết thúc' : `Chấm công ${shifts.find(s => s.key === selected)?.label.toLowerCase()}` }}
    </v-btn>
  </section>
</template>

<style scoped>
.dashboard-card { background:#fff; border:1px solid var(--smax-grey-200); border-radius:14px; padding:16px; box-shadow:0 1px 2px rgba(16,24,40,.035); }
.card-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:13px; }.card-heading h3 { margin:0; font-size:15px; color:var(--smax-text); }.card-heading p { margin:3px 0 0; font-size:11.5px; color:#8a8d9c; }
.selected-caption { padding:5px 9px; border-radius:999px; color:var(--smax-primary-700); background:var(--smax-primary-soft); font-size:11px; font-weight:700; }
.shift-list { display:flex; flex-direction:column; gap:8px; }.shift-row { width:100%; min-height:70px; display:grid; grid-template-columns:40px minmax(0,1fr) auto 18px; align-items:center; gap:10px; padding:10px; border:1px solid #e8ebf0; border-radius:12px; background:#fff; text-align:left; color:inherit; cursor:pointer; transition:border-color .15s,background .15s,box-shadow .15s; }.shift-row:hover { border-color:#b8cdf0; }.shift-row.is-selected { border-color:var(--smax-primary); background:#f7faff; box-shadow:0 0 0 2px rgba(47,128,237,.08); }.shift-row.state-done,.shift-row.state-late { background:#fbfffd; }.shift-icon { width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:#f5f7fa;color:#667085; }.state-active .shift-icon,.is-selected .shift-icon { color:var(--smax-primary);background:var(--smax-primary-soft); }.state-done .shift-icon { color:#16845d;background:#eaf9f2; }.state-late .shift-icon { color:#bd7410;background:#fff7e8; }.shift-main { display:flex;flex-direction:column;gap:3px;min-width:0; }.shift-main strong { font-size:13.5px;color:var(--smax-text); }.shift-main small,.shift-meta small { color:#8a8d9c;font-size:11.5px;font-variant-numeric:tabular-nums; }.shift-meta { display:flex;align-items:flex-end;flex-direction:column;gap:4px; }.status-badge { display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:999px;background:#f1f3f6;color:#667085;font-size:10.5px;font-weight:700;white-space:nowrap; }.state-active .status-badge { color:var(--smax-primary-700);background:var(--smax-primary-soft); }.state-done .status-badge { color:#147a55;background:#eaf9f2; }.state-late .status-badge { color:#a66109;background:#fff3dc; }.state-ended .status-badge { color:#7a4250;background:#f8eff1; }.chevron { color:#a4a8b2; }
.network-note,.network-warning { display:flex;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 11px;border-radius:10px;font-size:11.5px; }.network-note { color:#526071;background:#f7f8fa; }.network-warning { color:#b4232b;background:#fff1f2;border:1px solid #ffd8da; }.network-warning div { display:flex;flex-direction:column;gap:2px; }.network-warning span { color:#8c3b40; }.card-checkin { min-height:44px;margin-top:12px;font-weight:700; }
@media(max-width:600px){.dashboard-card{padding:13px}.shift-row{grid-template-columns:38px minmax(0,1fr) auto;}.chevron{display:none}.shift-meta small{display:none}}
</style>
