<script setup lang="ts">
export interface WeekDayView { date:string; dayLabel:string; dateLabel:string; isToday:boolean; entries:Array<{shift:string;time:string;status:'on_time'|'late'}>; leaveLabel?:string; summary:string }
defineProps<{ days:WeekDayView[]; loading?:boolean }>();
</script>
<template>
  <section class="dashboard-card week-card">
    <div class="card-heading"><div><h3>Lịch sử tuần này</h3><p>Giờ chấm công thực tế theo từng ngày</p></div><div class="legend"><span><i class="ok"/>Đúng giờ</span><span><i class="late"/>Đi trễ</span></div></div>
    <div v-if="loading" class="week-loading"><div v-for="i in 7" :key="i" /></div>
    <div v-else class="week-list">
      <div v-for="day in days" :key="day.date" class="week-row" :class="{'is-today':day.isToday}">
        <div class="day-name"><strong>{{ day.dayLabel }}</strong><small>{{ day.dateLabel }}</small></div>
        <div class="day-events">
          <template v-if="day.entries.length">
            <span v-for="entry in day.entries" :key="entry.shift" class="time-chip" :class="entry.status"><v-icon :icon="entry.status === 'late' ? 'mdi-clock-alert-outline':'mdi-check-circle-outline'" size="14"/><b>{{ entry.time }}</b><small>{{ entry.shift }}</small></span>
          </template>
          <span v-else-if="day.leaveLabel" class="leave-chip"><v-icon icon="mdi-calendar-minus-outline" size="14"/>{{ day.leaveLabel }}</span>
          <span v-else class="empty-time">Chưa làm</span>
        </div>
        <span class="day-summary">{{ day.summary }}</span>
      </div>
    </div>
  </section>
</template>
<style scoped>
.dashboard-card{background:#fff;border:1px solid var(--smax-grey-200);border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(16,24,40,.035)}.card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}.card-heading h3{margin:0;font-size:15px;color:var(--smax-text)}.card-heading p{margin:3px 0 0;font-size:11.5px;color:#8a8d9c}.legend{display:flex;gap:10px;color:#7b8190;font-size:10.5px}.legend span{display:flex;align-items:center;gap:4px}.legend i{width:7px;height:7px;border-radius:50%}.legend .ok{background:#2ec4b6}.legend .late{background:#ff9f1c}.week-row{min-height:59px;display:grid;grid-template-columns:105px minmax(0,1fr) 94px;align-items:center;gap:10px;border-bottom:1px solid #f0f2f5;padding:7px 4px}.week-row:last-child{border-bottom:0}.week-row.is-today{margin-inline:-5px;padding-inline:9px;border-radius:10px;background:#f7faff;border-bottom-color:transparent}.day-name{display:flex;flex-direction:column;gap:2px}.day-name strong{font-size:12.5px;color:#303442}.is-today .day-name strong{color:var(--smax-primary)}.day-name small{font-size:10.5px;color:#989ca7}.day-events{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}.time-chip{display:inline-grid;grid-template-columns:14px auto;column-gap:4px;align-items:center;padding:5px 7px;border-radius:8px;background:#eefaf5;color:#147a55}.time-chip.late{background:#fff5e5;color:#a66109}.time-chip b{font-size:11.5px;font-variant-numeric:tabular-nums}.time-chip small{grid-column:2;font-size:9.5px;opacity:.8}.empty-time{font-size:11.5px;color:#a1a5af}.leave-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border-radius:8px;background:#f1effc;color:#6555a5;font-size:10.5px;font-weight:650}.day-summary{text-align:right;color:#7f8491;font-size:11px}.week-loading{display:flex;flex-direction:column}.week-loading div{height:58px;border-bottom:1px solid #f0f2f5;background:linear-gradient(90deg,transparent,#f8f9fb,transparent);animation:pulse 1.2s infinite}@keyframes pulse{50%{opacity:.45}}
@media(max-width:600px){.dashboard-card{padding:13px}.legend{display:none}.week-row{grid-template-columns:78px minmax(0,1fr)}.day-summary{display:none}.time-chip small{display:none}.time-chip{display:inline-flex}.day-name strong{font-size:11.5px}}
</style>
