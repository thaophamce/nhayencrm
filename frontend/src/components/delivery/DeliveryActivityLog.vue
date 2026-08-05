<template>
  <section class="activity-page">
    <header>
      <div><h1>Hoạt động gần đây</h1><p>Theo dõi thao tác tạo, cập nhật và xóa đơn trên site Giao vận</p></div>
      <v-btn variant="outlined" prepend-icon="mdi-refresh" :loading="loading" @click="load">Làm mới</v-btn>
    </header>

    <div class="filters">
      <v-text-field v-model="search" label="Tìm mã đơn hoặc nhân viên" prepend-inner-icon="mdi-magnify" density="compact" hide-details clearable @keyup.enter="apply" />
      <v-select v-model="action" :items="actionOptions" item-title="label" item-value="value" density="compact" hide-details />
      <v-select v-model="userId" :items="userOptions" item-title="label" item-value="value" density="compact" hide-details />
      <v-btn color="#1A6FD4" @click="apply">Lọc</v-btn>
    </div>

    <div class="activity-card" aria-live="polite">
      <div v-if="loading" class="state"><v-progress-circular indeterminate color="primary" size="28" /><span>Đang tải hoạt động…</span></div>
      <div v-else-if="error" class="state error-state"><v-icon>mdi-alert-circle-outline</v-icon><span>{{ error }}</span><v-btn size="small" variant="outlined" @click="load">Thử lại</v-btn></div>
      <div v-else-if="!activities.length" class="state"><v-icon size="34">mdi-history</v-icon><span>Chưa có hoạt động phù hợp</span></div>
      <ol v-else class="timeline">
        <li v-for="item in activities" :key="item.id">
          <div class="activity-icon" :class="kind(item.action)"><v-icon size="18">{{ icon(item.action) }}</v-icon></div>
          <div class="activity-main">
            <div><strong>{{ label(item.action) }}</strong> <button v-if="orderCode(item)" type="button" @click="openOrder(orderCode(item))">#{{ orderCode(item) }}</button></div>
            <p>{{ detail(item) }}</p>
            <small>{{ actor(item) }} · {{ dateTime(item.createdAt) }}</small>
          </div>
          <time :datetime="item.createdAt">{{ relative(item.createdAt) }}</time>
        </li>
      </ol>
    </div>

    <footer><span>{{ total.toLocaleString('vi-VN') }} hoạt động</span><v-pagination v-model="page" :length="totalPages" density="compact" @update:model-value="load" /></footer>
    <DeliveryOrderDialog v-model="dialog" :model="selected" @saved="load" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import DeliveryOrderDialog from './DeliveryOrderDialog.vue';

const activities = ref<any[]>([]); const users = ref<any[]>([]); const loading = ref(false); const error = ref('');
const search = ref(''); const action = ref(''); const userId = ref(''); const page = ref(1); const total = ref(0); const totalPages = ref(1);
const dialog = ref(false); const selected = ref<any>();
const actionOptions = [
  { value: '', label: 'Tất cả hành động' }, { value: 'delivery.create', label: 'Tạo đơn' },
  { value: 'delivery.update', label: 'Cập nhật đơn' }, { value: 'delivery.delete', label: 'Xóa đơn' },
  { value: 'delivery.tracking_sync', label: 'Đồng bộ vận chuyển' },
];
const userOptions = computed(() => [{ value: '', label: 'Tất cả nhân viên' }, ...users.value.map((user) => ({ value: user.id, label: user.fullName || user.email || 'Nhân viên' }))]);

async function load() {
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/delivery/activity', { params: { page: page.value, limit: 30, search: search.value || undefined, action: action.value || undefined, userId: userId.value || undefined } });
    activities.value = data.activities || []; users.value = data.users || []; total.value = data.total || 0; totalPages.value = Math.max(1, data.totalPages || 1);
  } catch (err: any) { error.value = err.response?.data?.error || 'Không tải được nhật ký hoạt động'; }
  finally { loading.value = false; }
}
function apply() { page.value = 1; void load(); }
function orderCode(item: any) { return String(item.details?.orderCode || ''); }
function actor(item: any) { return item.user?.fullName || item.user?.email || 'Hệ thống'; }
function label(value: string) { return ({ 'delivery.create': 'Tạo đơn', 'delivery.update': 'Cập nhật đơn', 'delivery.delete': 'Xóa đơn', 'delivery.tracking_sync': 'Đồng bộ vận chuyển' } as Record<string, string>)[value] || 'Thao tác đơn'; }
function kind(value: string) { return value.split('.')[1] || 'update'; }
function icon(value: string) { return ({ 'delivery.create': 'mdi-plus', 'delivery.update': 'mdi-pencil-outline', 'delivery.delete': 'mdi-delete-outline', 'delivery.tracking_sync': 'mdi-truck-sync-outline' } as Record<string, string>)[value] || 'mdi-history'; }
function detail(item: any) { if (item.action === 'delivery.update' && Array.isArray(item.details?.fields)) return `Đã thay đổi: ${item.details.fields.join(', ')}`; if (item.action === 'delivery.create' && item.details?.source === 'bulk') return 'Được tạo bằng chức năng tạo hàng loạt'; return label(item.action); }
function dateTime(value: string) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
function relative(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); if (minutes < 1) return 'Vừa xong'; if (minutes < 60) return `${minutes} phút trước`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} giờ trước`; return `${Math.floor(hours / 24)} ngày trước`; }
async function openOrder(code: string) { try { const { data } = await api.get('/delivery/orders', { params: { search: code, limit: 1 } }); if (data.orders?.[0]) { selected.value = data.orders[0]; dialog.value = true; } } catch { /* Đơn đã xóa chỉ còn trong nhật ký. */ } }
watch([action, userId], apply);
onMounted(load);
</script>

<style scoped>
.activity-page{font-size:13px;min-height:calc(100vh - 52px);background:#f3f5f8;padding:18px;color:#182133;overflow:auto}.activity-page>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.activity-page h1{margin:0;font-size:24px}.activity-page header p{margin:3px 0;color:#667085}.filters{display:grid;grid-template-columns:minmax(260px,1.5fr) minmax(180px,.7fr) minmax(180px,.7fr) auto;gap:8px;background:#fff;border:1px solid #e0e5ec;border-radius:9px;padding:10px;margin-bottom:10px}.activity-card{background:#fff;border:1px solid #dce2ea;border-radius:10px;min-height:350px}.state{min-height:350px;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;color:#667085}.error-state{color:#b42318}.timeline{list-style:none;margin:0;padding:0 20px}.timeline li{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;align-items:start;padding:16px 4px;border-bottom:1px solid #edf0f4}.timeline li:last-child{border-bottom:0}.activity-icon{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:#eaf2ff;color:#1767d5}.activity-icon.create{background:#e9f8ef;color:#16834a}.activity-icon.delete{background:#fff0f0;color:#d92d20}.activity-icon.tracking_sync{background:#fff6e5;color:#b76e00}.activity-main strong{font-size:14px}.activity-main button{border:0;background:none;color:#075dcc;font-weight:700;cursor:pointer;padding:0}.activity-main p{margin:4px 0;color:#566176}.activity-main small{color:#8490a3}.timeline time{color:#8490a3;white-space:nowrap}.activity-page>footer{display:flex;justify-content:space-between;align-items:center;padding:8px 0}@media(max-width:760px){.activity-page{padding:10px}.activity-page header p{display:none}.filters{grid-template-columns:1fr}.timeline{padding:0 10px}.timeline li{grid-template-columns:36px minmax(0,1fr)}.timeline time{grid-column:2}.activity-page>footer{align-items:flex-start;flex-direction:column}}
</style>
