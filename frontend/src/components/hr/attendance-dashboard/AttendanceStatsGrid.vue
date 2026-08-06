<script setup lang="ts">
defineProps<{
  workDays: number;
  workingDays: number;
  lateCount: number;
  totalHours: string;
  shiftCount: number;
  loading?: boolean;
}>();

const items = [
  { key: 'workDays', label: 'Ngày công tháng này', icon: 'mdi-check-circle-outline', tone: 'success', sub: 'workDays' },
  { key: 'lateCount', label: 'Số lần đi trễ', icon: 'mdi-clock-alert-outline', tone: 'danger', sub: 'late' },
  { key: 'totalHours', label: 'Tổng giờ làm', icon: 'mdi-timer-outline', tone: 'warning', sub: 'hours' },
  { key: 'shiftCount', label: 'Tổng ca đã làm', icon: 'mdi-calendar-check-outline', tone: 'primary', sub: 'shifts' },
] as const;
</script>

<template>
  <section class="stats-grid" aria-label="Thống kê chấm công tháng">
    <article v-for="item in items" :key="item.key" class="stat-card" :class="`tone-${item.tone}`">
      <div class="stat-icon"><v-icon :icon="item.icon" size="22" /></div>
      <div class="stat-copy">
        <div class="stat-label">{{ item.label }}</div>
        <template v-if="loading">
          <div class="skeleton value-skeleton" />
          <div class="skeleton sub-skeleton" />
        </template>
        <template v-else>
          <div class="stat-value">
            {{ item.key === 'workDays' ? workDays : item.key === 'lateCount' ? lateCount : item.key === 'totalHours' ? totalHours : shiftCount }}
          </div>
          <div class="stat-sub">
            <template v-if="item.sub === 'workDays'">/ {{ workingDays }} ngày công chuẩn</template>
            <template v-else-if="item.sub === 'late'">trong tháng đang chọn</template>
            <template v-else-if="item.sub === 'hours'">tính theo thời lượng ca</template>
            <template v-else>lượt chấm công</template>
          </div>
        </template>
      </div>
    </article>
  </section>
</template>

<style scoped>
.stats-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:14px; }
.stat-card { min-height:104px; display:flex; align-items:center; gap:13px; padding:16px; border:1px solid var(--smax-grey-200); border-radius:14px; background:#fff; box-shadow:0 1px 2px rgba(16,24,40,.035); }
.stat-icon { width:42px; height:42px; flex:0 0 42px; display:grid; place-items:center; border-radius:11px; }
.tone-success .stat-icon { color:#16845d; background:#eaf9f2; }
.tone-danger .stat-icon { color:#df4650; background:#fff0f1; }
.tone-warning .stat-icon { color:#bd7410; background:#fff7e8; }
.tone-primary .stat-icon { color:var(--smax-primary); background:var(--smax-primary-soft); }
.stat-copy { min-width:0; }
.stat-label { color:#667085; font-size:11.5px; font-weight:650; text-transform:uppercase; letter-spacing:.025em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.stat-value { margin-top:5px; color:var(--smax-text); font-size:24px; line-height:1; font-weight:760; font-variant-numeric:tabular-nums; }
.stat-sub { margin-top:5px; color:#8a8d9c; font-size:11.5px; }
.skeleton { border-radius:6px; background:linear-gradient(90deg,#f0f2f5 25%,#f7f8fa 37%,#f0f2f5 63%); background-size:400% 100%; animation:shimmer 1.3s infinite; }
.value-skeleton { width:64px; height:24px; margin-top:7px; }.sub-skeleton { width:105px; height:10px; margin-top:7px; }
@keyframes shimmer { from { background-position:100% 0 } to { background-position:0 0 } }
@media (max-width:1200px) { .stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:600px) { .stats-grid { gap:8px; } .stat-card { min-height:108px; align-items:flex-start; flex-direction:column; gap:8px; padding:12px; } .stat-icon { width:34px; height:34px; flex-basis:34px; border-radius:9px; } .stat-label { white-space:normal; font-size:10.5px; } .stat-value { font-size:21px; } .stat-sub { line-height:1.25; } }
</style>
