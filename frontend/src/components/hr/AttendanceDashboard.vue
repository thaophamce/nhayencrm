<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div class="attendance-dashboard">
    <AttendancePageHeader
      :date-label="todayLongLabel"
      :period="period"
      :network="networkState"
      :network-detail="networkDetail"
      :primary-label="primaryLabel"
      :primary-disabled="primaryDisabled"
      :primary-loading="submitting !== null"
      @update:period="changePeriod"
      @checkin="attemptCheckin(selectedShift)"
    />

    <div v-if="loadError" class="load-error" role="alert">
      <v-icon icon="mdi-cloud-alert-outline" size="22" />
      <div><strong>Không tải được dữ liệu chấm công</strong><span>{{ loadError }}</span></div>
      <v-btn variant="tonal" color="primary" size="small" @click="load">Thử lại</v-btn>
    </div>

    <AttendanceStatsGrid
      :work-days="stats.workDays" :working-days="workingDays" :late-count="stats.lateCount"
      :total-hours="totalHoursLabel" :shift-count="stats.shiftCount" :loading="loading"
    />

    <div class="dashboard-grid">
      <TodayShiftCard
        :shifts="shiftViews" :selected="selectedShift" :submitting="submitting" :network-error="ipError"
        @select="selectedShift = $event" @checkin="attemptCheckin"
      />
      <WeeklyAttendanceCard :days="weekDays" :loading="loading" />
      <AttendanceSidePanel
        :work-days="stats.workDays" :working-days="workingDays" :recent-leaves="recentLeaves"
        :can-leave="canLeave" :can-history="canAttendance" :can-payroll="canPayroll" :loading="leavesLoading"
        @navigate="handleNavigate"
      />
    </div>
    <AttendanceHelpCard />
    <LeaveRequestDialog v-model="leaveDialog" @submitted="loadLeaves" />

    <v-dialog v-model="historyDialog" max-width="1040" scrollable>
      <v-card class="history-dialog-card">
        <v-card-title class="history-dialog-title">
          <div><v-icon icon="mdi-history" size="22"/><span>L?ch s? ch?m c?ng</span></div>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="??ng l?ch s? ch?m c?ng" @click="historyDialog=false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="history-dialog-body">
          <AttendanceHistoryTable mode="me" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="lateDialog" max-width="440" persistent>
      <v-card>
        <v-card-title class="late-title"><v-icon icon="mdi-clock-alert-outline" />Đi trễ</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">Bạn đang chấm công <strong>{{ pendingShift ? SHIFT_LABEL[pendingShift] : '' }}</strong> trễ. Vui lòng nhập lý do:</p>
          <v-textarea v-model="lateReason" label="Lý do đi trễ" rows="3" auto-grow autofocus :error-messages="lateReasonError" />
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn variant="text" @click="cancelLate">Huỷ</v-btn><v-btn color="primary" :loading="submitting !== null" @click="confirmLate">Xác nhận</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { getOrgParts, orgDayKey } from '@/composables/use-org-timezone';
import { LEAVE_STATUS, SHIFT_LABEL, SHIFTS, currentPeriod, type ShiftKey } from '@/constants/hr';
import AttendancePageHeader from './attendance-dashboard/AttendancePageHeader.vue';
import AttendanceStatsGrid from './attendance-dashboard/AttendanceStatsGrid.vue';
import TodayShiftCard, { type ShiftView } from './attendance-dashboard/TodayShiftCard.vue';
import WeeklyAttendanceCard, { type WeekDayView } from './attendance-dashboard/WeeklyAttendanceCard.vue';
import AttendanceSidePanel from './attendance-dashboard/AttendanceSidePanel.vue';
import AttendanceHelpCard from './attendance-dashboard/AttendanceHelpCard.vue';
import LeaveRequestDialog from './attendance-dashboard/LeaveRequestDialog.vue';
import AttendanceHistoryTable from './AttendanceHistoryTable.vue';

const emit = defineEmits<{ (e:'navigate', value:'leave'|'history'|'payroll'):void }>();
function handleNavigate(value:'leave'|'history'|'payroll'){ if(value==='leave') leaveDialog.value=true; else if(value==='history') historyDialog.value=true; else emit('navigate',value) }
const toast=useToast(); const auth=useAuthStore();
const canAttendance=auth.canAccess('attendance'); const canLeave=auth.canAccess('leave'); const canPayroll=auth.canAccess('payroll');
const period=ref(currentPeriod()); const records=ref<any[]>([]); const config=ref<any>(null); const leaves=ref<any[]>([]);
const loading=ref(true); const leavesLoading=ref(false); const loadError=ref(''); const submitting=ref<ShiftKey|null>(null); const ipError=ref('');
const networkState=ref<'open'|'unknown'|'valid'|'invalid'>('unknown'); const networkDetail=ref('');
const selectedShift=ref<ShiftKey>('morning'); const leaveDialog=ref(false); const historyDialog=ref(false); const lateDialog=ref(false); const pendingShift=ref<ShiftKey|null>(null); const lateReason=ref(''); const lateReasonError=ref('');
const todayKey=computed(()=>orgDayKey(new Date()));
const workingDays=computed(()=>config.value?.workingDaysPerMonth||26);
const todayParts=computed(()=>getOrgParts(new Date()));
const todayLongLabel=computed(()=>new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(todayParts.value?.year||0,(todayParts.value?.month||1)-1,todayParts.value?.day||1))));
function hhmm(value:string){const [h,m]=String(value||'').split(':').map(Number);return (h||0)*60+(m||0)}
const stats=computed(()=>{const dates=new Set<string>();let lateCount=0;for(const r of records.value){if(r.shift==='morning'||r.shift==='afternoon')dates.add(r.date);if(r.status==='late')lateCount++}return{workDays:dates.size,lateCount,shiftCount:records.value.length}});
const totalMinutes=computed(()=>records.value.reduce((sum,r)=>{const s=config.value?.shifts?.[r.shift];return sum+(s?Math.max(0,hhmm(s.end)-hhmm(s.start)):0)},0));
const totalHoursLabel=computed(()=>`${String(Math.floor(totalMinutes.value/60)).padStart(2,'0')}:${String(totalMinutes.value%60).padStart(2,'0')}`);
const todayRecords=computed(()=>records.value.filter(r=>r.date===todayKey.value));
function formatCheckin(iso:string){const p=getOrgParts(iso);return p?`${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`:'—'}
function shiftView(key:ShiftKey):ShiftView{const meta=SHIFTS.find(s=>s.key===key)!;const rec=todayRecords.value.find(r=>r.shift===key);const time=config.value?.shifts?.[key];const minutes=(todayParts.value?.hour||0)*60+(todayParts.value?.minute||0);const start=hhmm(time?.start);const end=hhmm(time?.end);let state:ShiftView['state']='upcoming';let stateLabel='Chưa đến giờ';if(rec){state=rec.status==='late'?'late':'done';stateLabel=rec.status==='late'?'Đi trễ':'Đã chấm'}else if(time&&minutes>end){state='ended';stateLabel='Đã kết thúc'}else if(time&&minutes>=start){state='active';stateLabel='Đang trong giờ'}return{key,label:meta.label,icon:meta.icon,time:time?`${time.start} – ${time.end}`:'Chưa cấu hình',state,stateLabel,checkinLabel:rec?`Đã chấm lúc ${formatCheckin(rec.checkinTime)}`:undefined}}
const shiftViews=computed(()=>SHIFTS.map(s=>shiftView(s.key)));
const selectedView=computed(()=>shiftViews.value.find(s=>s.key===selectedShift.value));
const primaryDisabled=computed(()=>!selectedView.value||['done','late'].includes(selectedView.value.state));
const primaryLabel=computed(()=>primaryDisabled.value?'Ca đã chấm công':`Chấm công ${selectedView.value?.label.toLowerCase()||''}`);
const weekDays=computed<WeekDayView[]>(()=>{const p=todayParts.value;if(!p)return[];const base=Date.UTC(p.year,p.month-1,p.day);const dow=new Date(base).getUTCDay();const monday=dow===0?-6:1-dow;return Array.from({length:7},(_,i)=>{const dt=new Date(base+(monday+i)*86400000);const date=`${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;const dayRecords=records.value.filter(r=>r.date===date);const leave=leaves.value.find(l=>l.status==='approved'&&l.startDate<=date&&l.endDate>=date);const entries=dayRecords.map(r=>({shift:SHIFT_LABEL[r.shift]||r.shift,time:formatCheckin(r.checkinTime),status:r.status as 'on_time'|'late'}));let summary='Chưa làm';if(leave&&!entries.length)summary='Nghỉ phép';else if(entries.length>=2)summary='Đã đủ ca';else if(entries.length)summary='Đã chấm 1 ca';return{date,dayLabel:['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][dt.getUTCDay()],dateLabel:`${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}`,isToday:date===todayKey.value,entries,leaveLabel:leave?'Nghỉ phép':undefined,summary}})});
const recentLeaves=computed(()=>leaves.value.slice(0,3).map(l=>({id:l.id,title:`${l.startDate===l.endDate?'Nghỉ ngày':'Nghỉ từ'} ${formatDate(l.startDate)}${l.startDate!==l.endDate?` – ${formatDate(l.endDate)}`:''}`,date:l.reason,status:l.status,statusLabel:LEAVE_STATUS[l.status]?.label||l.status})));
function formatDate(v:string){const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}
function chooseSuggestedShift(){const available=shiftViews.value.find(s=>s.state==='active')||shiftViews.value.find(s=>s.state==='upcoming')||shiftViews.value.find(s=>!['done','late'].includes(s.state));if(available)selectedShift.value=available.key}
async function load(){loading.value=true;loadError.value='';try{const [rec,cfg]=await Promise.all([api.get('/attendance/me',{params:{month:period.value}}),api.get('/attendance/config')]);records.value=rec.data.records??[];config.value=cfg.data??null;networkState.value=(config.value?.allowedIps?.length??0)===0?'open':'unknown';networkDetail.value=networkState.value==='open'?'Đơn vị chưa cấu hình giới hạn IP':'IP sẽ được server xác minh khi gửi chấm công';chooseSuggestedShift()}catch(err:any){records.value=[];loadError.value=err?.response?.data?.hint||err?.response?.data?.error||'Vui lòng kiểm tra kết nối và thử lại.'}finally{loading.value=false}}
async function loadLeaves(){if(!canLeave)return;leavesLoading.value=true;try{const res=await api.get('/leave/me');leaves.value=res.data.records??res.data.leaves??[]}catch{leaves.value=[]}finally{leavesLoading.value=false}}
function changePeriod(value:string){if(!value)return;period.value=value;void load()}
async function attemptCheckin(shift:ShiftKey,reason?:string){submitting.value=shift;ipError.value='';try{await api.post('/attendance/checkin',{shift,lateReason:reason});toast.success('Chấm công thành công');networkState.value='valid';networkDetail.value='Server đã xác minh IP thành công';lateDialog.value=false;lateReason.value='';pendingShift.value=null;await load()}catch(err:any){const data=err?.response?.data;if(data?.error==='late_reason_required'){pendingShift.value=shift;lateDialog.value=true}else if(data?.error==='ip_not_allowed'){networkState.value='invalid';networkDetail.value=data.hint||'IP không được phép';ipError.value=`${data.hint||'IP không được phép chấm công'} (IP của bạn: ${data.clientIp||'?'})`}else if(data?.error==='already_checked_in'){toast.warning('Bạn đã chấm công ca này rồi');await load()}else toast.error(data?.hint||data?.error||'Chấm công thất bại')}finally{submitting.value=null}}
function confirmLate(){if(!lateReason.value.trim()){lateReasonError.value='Nhập lý do đi trễ';return}lateReasonError.value='';if(pendingShift.value)void attemptCheckin(pendingShift.value,lateReason.value.trim())}
function cancelLate(){lateDialog.value=false;lateReason.value='';lateReasonError.value='';pendingShift.value=null}
onMounted(()=>{void Promise.all([load(),loadLeaves()])});
</script>

<style scoped>
.attendance-dashboard{max-width:1680px;margin:0 auto;padding-bottom:20px}.dashboard-grid{display:grid;grid-template-columns:minmax(320px,.92fr) minmax(390px,1.2fr) minmax(270px,.72fr);align-items:start;gap:12px}.load-error{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:10px;margin-bottom:12px;padding:11px 13px;border:1px solid #ffd6d8;border-radius:12px;background:#fff4f4;color:#bd2f37}.load-error div{display:flex;flex-direction:column}.load-error strong{font-size:12.5px}.load-error span{font-size:11px;color:#925158}.late-title{display:flex;align-items:center;gap:8px;color:#a66109}.history-dialog-card{border-radius:16px!important}.history-dialog-title{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;font-size:18px;font-weight:800;color:var(--smax-text)}.history-dialog-title>div{display:flex;align-items:center;gap:10px}.history-dialog-title>div>.v-icon{color:var(--smax-primary)}.history-dialog-body{padding:20px!important;background:#f8fafc}@media(max-width:1350px){.dashboard-grid{grid-template-columns:minmax(300px,.9fr) minmax(390px,1.1fr)}.dashboard-grid>:last-child{grid-column:1/-1}.dashboard-grid>:last-child :deep(.side-stack){display:grid;grid-template-columns:1fr 1fr}}@media(max-width:900px){.dashboard-grid{grid-template-columns:1fr}.dashboard-grid>:last-child{grid-column:auto}.dashboard-grid>:last-child :deep(.side-stack){display:grid;grid-template-columns:1fr 1fr}}@media(max-width:600px){.attendance-dashboard{padding-bottom:72px}.dashboard-grid{gap:10px}.dashboard-grid>:last-child :deep(.side-stack){grid-template-columns:1fr}.load-error{grid-template-columns:22px 1fr}.load-error .v-btn{grid-column:1/-1}}
</style>
