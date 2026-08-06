<template>
  <section class="delivery">
    <header>
      <div>
        <h1>Giao vận</h1>
        <p>Đơn nội bộ, công nợ và theo dõi vận chuyển</p>
      </div>
      <div class="actions">
        <v-btn variant="outlined" prepend-icon="mdi-refresh" :loading="loading" @click="refresh">Làm mới</v-btn>
        <v-btn v-if="canCreate" variant="outlined" color="#1A6FD4" prepend-icon="mdi-layers-triple" @click="bulkDialog = true">Tạo hàng loạt</v-btn>
        <v-btn v-if="canCreate" color="#1A6FD4" prepend-icon="mdi-plus" @click="edit()">Tạo đơn</v-btn>
      </div>
    </header>

    <div class="stats">
      <article><span>Tổng đơn</span><b>{{ stats.totalOrders || 0 }}</b></article>
      <article><span>Doanh thu</span><b>{{ money(stats.revenue) }}</b></article>
      <article><span>Còn phải thu</span><b class="danger">{{ money(stats.outstanding) }}</b></article>
      <article><span>Quá hạn 3 ngày</span><b class="warn">{{ stats.overdue || 0 }}</b></article>
    </div>

    <div class="filters">
      <v-text-field v-model="filters.search" label="Tìm mã đơn, người nhận, SĐT, vận đơn" prepend-inner-icon="mdi-magnify" density="compact" hide-details clearable @keyup.enter="apply" />
      <v-select v-model="filters.paymentStatus" :items="[{ value: '', label: 'Mọi thanh toán' }, ...paymentStatuses]" item-title="label" item-value="value" density="compact" hide-details />
      <v-select v-model="filters.deliveryMethod" :items="[{ value: '', label: 'Mọi hình thức giao' }, ...deliveryMethods]" item-title="label" item-value="value" density="compact" hide-details />
      <v-select v-model="filters.deliveryStatus" :items="[{ value: '', label: 'Mọi trạng thái giao' }, ...deliveryStatuses]" item-title="label" item-value="value" density="compact" hide-details />
      <v-checkbox v-model="filters.overdue" label="Chỉ quá hạn" density="compact" hide-details />
      <v-btn @click="apply">Lọc</v-btn>
    </div>

    <div class="table">
      <div v-if="loading" class="state">Đang tải…</div>
      <div v-else-if="!orders.length" class="state">Chưa có đơn giao vận</div>
      <table v-else>
        <thead><tr><th>Mã đơn</th><th>Ngày tạo</th><th>Tổng tiền</th><th>Đã cọc</th><th>Còn lại</th><th>Hình thức giao</th><th>Trạng thái</th><th>Người tạo</th><th class="action-column">Thao tác</th></tr></thead>
        <tbody>
          <tr v-for="o in orders" :key="o.id" @click="edit(o)">
            <td><b class="order-code">{{ o.orderCode }}</b></td>
            <td>{{ date(o.createdDate) }}</td>
            <td class="money-strong">{{ money(o.totalAmount) }}</td>
            <td>{{ money(o.deposit) }}</td>
            <td class="danger money-strong">{{ money(remaining(o)) }}</td>
            <td><span class="method-badge" :class="`method-${o.deliveryMethod}`">{{ label(deliveryMethods, o.deliveryMethod) }}</span></td>
            <td><span class="pill" :class="o.deliveryStatus">{{ label(deliveryStatuses, o.deliveryStatus) }}</span></td>
            <td>{{ o.createdBy?.fullName || '—' }}</td>
            <td class="action-column"><v-btn v-if="canDelete" icon="mdi-delete-outline" size="small" variant="text" color="error" aria-label="Xóa đơn" @click.stop="remove(o)" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer><span>{{ total.toLocaleString('vi-VN') }} đơn</span><v-pagination v-model="page" :length="totalPages" density="compact" @update:model-value="load" /></footer>
    <DeliveryOrderDialog v-model="dialog" :model="selected" @saved="refresh" />
    <BulkCreateDialog v-model="bulkDialog" @saved="refresh" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { useDeliveryOrders } from '@/composables/use-delivery-orders';
import DeliveryOrderDialog from '@/components/delivery/DeliveryOrderDialog.vue';
import BulkCreateDialog from '@/components/delivery/BulkCreateDialog.vue';
import { paymentStatuses, deliveryMethods, deliveryStatuses, label } from '@/constants/delivery';

const auth = useAuthStore();
const toast = useToast();
const { orders, loading, total, page, filters, totalPages, load } = useDeliveryOrders();
const stats = ref<any>({});
const dialog = ref(false);
const bulkDialog = ref(false);
const selected = ref<any>();
const canCreate = computed(() => auth.canAccess('delivery', 'create'));
const canDelete = computed(() => auth.canAccess('delivery', 'delete'));

function money(value: any) { return new Intl.NumberFormat('vi-VN').format(Number(value) || 0) + ' đ'; }
function remaining(order: { totalAmount: number; deposit: number }) { return Math.max(0, (Number(order.totalAmount) || 0) - (Number(order.deposit) || 0)); }
function date(value: string) { return new Intl.DateTimeFormat('vi-VN').format(new Date(value)); }
function edit(order?: any) { if (order && !auth.canAccess('delivery', 'edit')) return; selected.value = order ? { ...order } : undefined; dialog.value = true; }
async function refresh() { await Promise.all([load(), api.get('/delivery/stats').then((response) => { stats.value = response.data; })]); }
function apply() { page.value = 1; refresh(); }
async function remove(order: any) {
  if (!confirm(`Xóa đơn ${order.orderCode}? Dữ liệu sẽ được xóa mềm và ẩn khỏi danh sách.`)) return;
  try { await api.delete(`/delivery/orders/${order.id}`); toast.success('Đã xóa đơn'); refresh(); }
  catch (error: any) { toast.error(error.response?.data?.error || 'Không xóa được đơn'); }
}
watch(() => [filters.value.paymentStatus, filters.value.deliveryMethod, filters.value.deliveryStatus, filters.value.overdue], apply);
onMounted(refresh);
</script>

<style scoped>
.delivery{font-size:13px;min-height:calc(100vh - 52px);background:#f3f5f8;padding:18px;color:#182133}
.delivery :deep(.v-btn),.delivery :deep(.v-field),.delivery :deep(.v-label),.delivery :deep(.v-selection-control),.delivery :deep(.v-pagination){font-size:13px}
.delivery>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.delivery h1{margin:0;font-size:24px}.delivery p{margin:3px 0;color:#667085}.actions{display:flex;gap:8px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}.stats article{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px}.stats span,.stats b{display:block}.stats span{font-size:13px;color:#667085}.stats b{font-size:21px;margin-top:5px}.danger{color:#dc3545}.warn{color:#db8b00}
.filters{display:grid;grid-template-columns:minmax(250px,1.6fr) repeat(3,minmax(150px,1fr)) auto auto;gap:8px;background:#fff;padding:10px;border:1px solid #e0e5ec;border-radius:9px;margin-bottom:10px}
.table{background:#fff;border:1px solid #dce2ea;border-radius:9px;overflow:auto;min-height:300px}.state{padding:80px;text-align:center;color:#667085}table{width:100%;min-width:1120px;border-collapse:collapse;font-size:15px}th{font-size:15px;background:#e5e9ef;text-align:left;padding:11px;white-space:nowrap}td{font-size:15px;padding:11px;border-bottom:1px solid #edf0f4;cursor:pointer}table :deep(.v-btn){font-size:15px}.pill,.method-badge{display:inline-block;padding:5px 10px;border-radius:999px;font-weight:700;font-size:15px;line-height:1.25}.pill{background:#e7eef8;color:#1557a6}.method-pickup{background:#c65d00;color:#fff}.method-chanh-xe{background:#0759b8;color:#fff}.method-grab{background:#087f3e;color:#fff}.method-viettelpost{background:#c6284d;color:#fff}.order-code{font-size:16px}.money-strong{font-weight:700}.action-column{text-align:center;width:92px}.pill.delivered{background:#dcf5e7;color:#16713c}.pill.failed,.pill.cancelled{background:#fde5e5;color:#b52828}.pill.shipping{background:#e0ecff;color:#1454ba}.pill.returned{background:#fff0d2;color:#9a6000}
.delivery>footer{display:flex;justify-content:space-between;align-items:center;padding:8px 0}
@media(max-width:900px){.delivery{padding:10px}.delivery>header{align-items:flex-start}.delivery p{display:none}.stats{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr 1fr}.filters>*:first-child{grid-column:1/-1}.table{border:0;background:transparent;overflow:visible}table,tbody{display:block;min-width:0}thead{display:none}tr{display:grid;grid-template-columns:1fr 1fr;background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:9px;padding:10px}td{border:0;padding:6px;min-width:0}td:last-child{position:absolute;right:18px}.actions .v-btn:first-child{display:none}}
@media(max-width:500px){.filters{grid-template-columns:1fr}.filters>*:first-child{grid-column:auto}.stats article{padding:10px}.stats b{font-size:17px}}
</style>