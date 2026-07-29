<template>
  <div class="design-order-panel">
    <header class="dop-head"><v-icon size="20">mdi-palette-outline</v-icon><div><b>Đơn thiết kế</b><small>Quản lý công việc thiết kế nội bộ</small></div></header>
    <div v-if="loading" class="dop-loading"><v-progress-circular indeterminate size="24" width="2" /> Đang tải đơn…</div>
    <v-form v-else v-model="isValid" class="dop-form">
      <v-text-field v-model="formData.orderCode" label="Mã đơn hàng *" placeholder="Ví dụ: D080608" :rules="[required]" variant="outlined" density="comfortable" :disabled="!canEdit || submitting" />
      <v-text-field v-model.number="formData.fileCount" type="number" min="1" label="Số mẫu thiết kế *" :rules="[required, positive]" variant="outlined" density="comfortable" :disabled="!canEdit || submitting" />
      <v-text-field v-model="formData.deadline" type="datetime-local" label="Hạn chót (Deadline)" variant="outlined" density="comfortable" :disabled="!canEdit || submitting" />
      <v-select v-model="formData.designerId" :items="designers" item-title="fullName" item-value="id" label="Gán Designer" clearable variant="outlined" density="comfortable" :disabled="!canEdit || submitting" />
      <v-select v-model="formData.status" :items="statusOptions" item-title="label" item-value="value" label="Trạng thái *" variant="outlined" density="comfortable" :disabled="!canEdit || submitting" />
      <v-textarea v-model="formData.notes" label="Ghi chú" placeholder="Thông tin thêm" rows="3" variant="outlined" density="comfortable" :disabled="!canEdit || submitting" />
      <div class="dop-checks">
        <v-checkbox v-model="formData.isUrgent" label="Đơn hàng GẤP" color="red" hide-details density="compact" :disabled="!canEdit || submitting" />
        <v-checkbox v-model="formData.hasDesignFee" label="Có phí thiết kế (+100.000đ)" color="orange-darken-3" hide-details density="compact" :disabled="!canEdit || submitting" />
        <v-checkbox v-if="isAdminOrManager" v-model="formData.isOutsource" label="Outsource - tính KPI Quang Trường" color="blue" hide-details density="compact" :disabled="!canEdit || submitting" />
      </div>
      <v-btn block color="#2F80ED" class="text-white" rounded="lg" :loading="submitting" :disabled="!isValid || !canEdit" @click="order ? saveOrder() : createOrder()">{{ order ? 'Lưu thay đổi' : 'Tạo đơn thiết kế' }}</v-btn>
      <p v-if="!canEdit" class="dop-permission">Designer chỉ được cập nhật trạng thái và ghi chú cho đơn được giao.</p>
      <section v-if="order?.statusHistory?.length" class="dop-history">
        <h4><v-icon size="17">mdi-history</v-icon> Lịch sử chuyển trạng thái</h4>
        <div v-for="h in order.statusHistory" :key="h.id" class="history-row"><span><b>{{ getOrderStatusLabel(h.status) }}</b><small>{{ h.changedBy?.fullName || 'Hệ thống' }}</small></span><time>{{ formatTime(h.changedAt) }}</time></div>
      </section>
    </v-form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { ORDER_STATUS_OPTIONS, getOrderStatusLabel } from '@/constants/order-status';
const props=defineProps<{conversationId:string;groupName?:string|null}>();
const toast=useToast(), authStore=useAuthStore();
const loading=ref(false),submitting=ref(false),isValid=ref(false),order=ref<any>(null),designers=ref<Array<{id:string;fullName:string}>>([]);
const isAdminOrManager=computed(()=>{const u=authStore.user;return u?.role==='owner'||u?.role==='admin'||authStore.canAccess('user')});
const canEdit=computed(()=>isAdminOrManager.value||order.value?.designerId===authStore.user?.id);
const statusOptions=ORDER_STATUS_OPTIONS;
const blank=()=>({orderCode:props.groupName||'',fileCount:1,deadline:'',isUrgent:false,hasDesignFee:false,isOutsource:false,designerId:null as string|null,status:'demo',notes:''});
const formData=ref(blank()); const required=(v:any)=>!!v||'Trường này là bắt buộc'; const positive=(v:any)=>Number(v)>0||'Giá trị phải lớn hơn 0';
function loadData(){if(!order.value){formData.value=blank();return}const o=order.value;formData.value={orderCode:o.orderCode||'',fileCount:o.fileCount||1,deadline:o.deadline?new Date(new Date(o.deadline).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',isUrgent:!!o.isUrgent,hasDesignFee:!!o.hasDesignFee,isOutsource:!!o.isOutsource,designerId:o.designerId||null,status:o.status||'demo',notes:o.notes||''}}
async function loadOrder(){loading.value=true;try{const {data}=await api.get(`/orders/by-conversation/${props.conversationId}`);order.value=data.order||null;loadData()}catch(e){console.error('[DesignOrderTabPanel] load failed',e);order.value=null;loadData()}finally{loading.value=false}}
async function loadDesigners(){try{const {data}=await api.get<{users?:Array<{id:string;fullName:string}>}>('/users');designers.value=data.users||[]}catch(e){console.error('[DesignOrderTabPanel] designers failed',e)}}
function payload(){return {...formData.value,deadline:formData.value.deadline?new Date(formData.value.deadline).toISOString():null}}
async function createOrder(){if(submitting.value||!isAdminOrManager.value)return;submitting.value=true;try{const {data}=await api.post('/orders',{...payload(),conversationId:props.conversationId});order.value=data;loadData();toast.success('Đã tạo đơn thiết kế');dispatch()}catch(e:any){toast.error(e.response?.data?.error||'Tạo đơn thiết kế thất bại')}finally{submitting.value=false}}
async function saveOrder(){if(!order.value||submitting.value||!canEdit.value)return;submitting.value=true;try{const {data}=await api.put(`/orders/${order.value.id}`,payload());order.value=data;loadData();toast.success('Đã cập nhật đơn thiết kế');dispatch()}catch(e:any){toast.error(e.response?.data?.error||'Cập nhật đơn thất bại')}finally{submitting.value=false}}
function dispatch(){window.dispatchEvent(new CustomEvent('order-updated',{detail:{conversationId:props.conversationId}}))}
function eventHandler(e:Event){if((e as CustomEvent).detail?.conversationId===props.conversationId)loadOrder()}
function formatTime(v:string){const d=new Date(v);return new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(d)}
watch(()=>props.conversationId,loadOrder);watch(()=>props.groupName,()=>{if(!order.value)formData.value.orderCode=props.groupName||''});
onMounted(()=>{loadOrder();loadDesigners();window.addEventListener('order-updated',eventHandler)});onUnmounted(()=>window.removeEventListener('order-updated',eventHandler));
</script>

<style scoped>
.design-order-panel{height:100%;min-height:0;display:flex;flex-direction:column;background:#f5f7fa;color:#1d2433}.dop-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border-bottom:1px solid #e2e7ef;color:#2f80ed}.dop-head div{display:flex;flex-direction:column}.dop-head b{font-size:15px}.dop-head small{font-size:11px;color:#7d8798}.dop-loading{display:flex;align-items:center;justify-content:center;gap:9px;padding:35px;color:#7d8798}.dop-form{padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:4px}.dop-checks{background:#fff;border:1px solid #e2e7ef;border-radius:8px;padding:4px 8px;margin-bottom:10px}.dop-permission{text-align:center;font-size:11px;color:#8a93a3}.dop-history{margin-top:14px;padding-top:13px;border-top:1px solid #dde3ec}.dop-history h4{display:flex;align-items:center;gap:6px;margin:0 0 10px;color:#606b7c}.history-row{display:flex;justify-content:space-between;padding:8px;border-left:3px solid #8cbbff;background:#fff;margin-bottom:6px}.history-row span{display:flex;flex-direction:column}.history-row small,.history-row time{font-size:11px;color:#818a99}
</style>
