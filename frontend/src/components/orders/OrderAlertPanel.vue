<template>
  <aside class="alert-panel" aria-label="Cảnh báo đơn thiết kế">
    <header class="alert-header">
      <div class="alert-title">
        <span class="alert-title-icon">
          <v-icon size="20" color="#F57C00">mdi-bell-outline</v-icon>
        </span>
        <h2 class="alert-heading">Cảnh báo</h2>
      </div>
      <span v-if="totalAlerts > 0" class="alert-count-badge">{{ totalAlerts }}</span>
    </header>

    <div v-if="loading && !orders.length" class="alert-state">
      <v-progress-circular indeterminate size="24" width="2" color="#F57C00" />
      <span>Đang kiểm tra...</span>
    </div>

    <div v-else-if="totalAlerts === 0" class="alert-state success">
      <span class="success-icon"><v-icon size="22" color="#168A50">mdi-check</v-icon></span>
      <strong>Không có đơn cần xử lý</strong>
      <small>Tất cả đơn hàng thiết kế đều đang xử lý đúng hạn.</small>
    </div>

    <template v-else>
      <div class="alert-content-scroll">
        <!-- SECTION 1: KHẨN CẤP -->
        <div v-if="urgentOrders.length > 0" class="alert-section">
          <div class="section-title text-urgent">
            {{ urgentOrders.length }} KHẨN CẤP
          </div>

          <div class="alert-card-list">
            <article
              v-for="order in visibleUrgentOrders"
              :key="order.id"
              class="alert-card card-urgent"
            >
              <div class="card-topline">
                <span class="tag-urgent">
                  <v-icon size="14" color="#E5484D">mdi-alert-circle</v-icon>
                  KHẨN CẤP
                </span>
                <span class="badge-urgent-time">{{ formatUrgentTime(order) }}</span>
              </div>

              <button type="button" class="order-code-link" @click="$emit('edit', order)">
                {{ order.orderCode }}
              </button>

              <div class="order-subtext">
                {{ getStatusLabel(order.status) }} · {{ order.designer?.fullName || 'Chưa gán' }}
              </div>

              <v-select
                :model-value="order.status"
                :items="statusOptions"
                item-title="label"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                class="status-select-box urgent-select"
                :menu-props="{ contentClass: 'order-alert-status-menu' }"
                :loading="updatingId === order.id"
                :disabled="Boolean(updatingId)"
                @update:model-value="status => updateStatus(order, status)"
              />
            </article>
          </div>
        </div>

        <!-- SECTION 2: CHỜ DEMO QUÁ LÂU -->
        <div v-if="demoOverdueOrders.length > 0" class="alert-section">
          <div class="section-title text-demo">
            {{ demoOverdueOrders.length }} CHỜ DEMO QUÁ LÂU
          </div>

          <div class="alert-card-list">
            <article
              v-for="order in visibleDemoOrders"
              :key="order.id"
              class="alert-card card-demo"
            >
              <div class="card-topline">
                <span class="tag-demo">
                  <v-icon size="14" color="#D48806">mdi-alert-circle</v-icon>
                  CHỜ DEMO
                </span>
                <span class="badge-demo-time">{{ formatDemoWaitingTime(order) }}</span>
              </div>

              <button type="button" class="order-code-link" @click="$emit('edit', order)">
                {{ order.orderCode }}
              </button>

              <div class="order-subtext">
                {{ order.designer?.fullName || 'Chưa gán' }}
              </div>

              <v-select
                :model-value="order.status"
                :items="statusOptions"
                item-title="label"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                class="status-select-box demo-select"
                :menu-props="{ contentClass: 'order-alert-status-menu' }"
                :loading="updatingId === order.id"
                :disabled="Boolean(updatingId)"
                @update:model-value="status => updateStatus(order, status)"
              />
            </article>
          </div>
        </div>
      </div>

      <!-- VIEW ALL / COLLAPSE BUTTON -->
      <button
        v-if="totalAlerts > previewLimit"
        type="button"
        class="view-all-btn"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Thu gọn' : `Xem tất cả (${totalAlerts})` }}
        <v-icon size="17">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </button>
    </template>

    <footer class="alert-footer">
      <span>Cập nhật tự động · {{ totalAlerts }} đơn cần xử lý</span>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';

const emit = defineEmits<{ (e: 'changed'): void; (e: 'edit', order: any): void }>();
const toast = useToast();

const loading = ref(false);
const updatingId = ref<string | null>(null);
const orders = ref<any[]>([]);
const now = ref(Date.now());
const expanded = ref(false);
const previewLimit = 5;
const thresholdMs = 12 * 60 * 60 * 1000; // 12 hours

const statusOptions = [
  { value: 'demo', label: 'Chờ demo' },
  { value: 'designing', label: 'Đang thiết kế' },
  { value: 'approved', label: 'Chốt in' },
  { value: 'cancelled', label: 'Khách huỷ' },
];

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

// Filter Urgent orders (isUrgent === true and not completed/cancelled)
const urgentOrders = computed(() => {
  return orders.value
    .filter(order => order.isUrgent && order.status !== 'approved' && order.status !== 'cancelled')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});

// Helper for Demo Start Time
function getDemoStartTime(order: any): number {
  if (!order) return Date.now();
  if (Array.isArray(order.statusHistory) && order.statusHistory.length > 0) {
    const demoEntries = order.statusHistory.filter((h: any) => h.status === 'demo');
    if (demoEntries.length > 0) {
      const lastDemo = demoEntries[demoEntries.length - 1];
      const t = new Date(lastDemo.changedAt).getTime();
      if (!isNaN(t)) return t;
    }
  }
  const created = new Date(order.createdAt).getTime();
  return isNaN(created) ? Date.now() : created;
}

function ageInDemoMs(order: any): number {
  const startTime = getDemoStartTime(order);
  return Math.max(0, now.value - startTime);
}

// Filter Demo Overdue orders (status === 'demo' && !isUrgent && demo age >= 12h)
const demoOverdueOrders = computed(() => {
  return orders.value
    .filter(order => !order.isUrgent && order.status === 'demo' && ageInDemoMs(order) >= thresholdMs)
    .sort((a, b) => ageInDemoMs(b) - ageInDemoMs(a));
});

const totalAlerts = computed(() => urgentOrders.value.length + demoOverdueOrders.value.length);

// Pagination / Visibility calculation
const visibleUrgentOrders = computed(() => {
  if (expanded.value) return urgentOrders.value;
  return urgentOrders.value.slice(0, previewLimit);
});

const visibleDemoOrders = computed(() => {
  if (expanded.value) return demoOverdueOrders.value;
  const remainingSlots = Math.max(0, previewLimit - visibleUrgentOrders.value.length);
  return demoOverdueOrders.value.slice(0, remainingSlots);
});

function formatUrgentTime(order: any) {
  const created = new Date(order.createdAt).getTime();
  const diffMs = Math.max(0, now.value - (isNaN(created) ? Date.now() : created));
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  return `${days} ngày`;
}

function formatDemoWaitingTime(order: any) {
  const hours = Math.floor(ageInDemoMs(order) / 3_600_000);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  return `${days} ngày`;
}

function getStatusLabel(s: string) {
  return statusOptions.find(o => o.value === s)?.label || s;
}

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const { data } = await api.get<{ orders: any[] }>('/orders', {
      params: { limit: 500, offset: 0 }
    });
    orders.value = data.orders || [];
    now.value = Date.now();
  } catch (error) {
    console.error('[OrderAlertPanel] load failed:', error);
  } finally {
    loading.value = false;
  }
}

async function updateStatus(order: any, status: string) {
  if (!status || status === order.status || updatingId.value) return;
  updatingId.value = order.id;
  try {
    await api.put(`/orders/${order.id}`, { status });
    toast.success(`Đã chuyển ${order.orderCode} sang ${getStatusLabel(status)}`);
    await refresh();
    emit('changed');
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Không cập nhật được trạng thái đơn');
  } finally {
    updatingId.value = null;
  }
}

onMounted(() => {
  void refresh();
  refreshTimer = setInterval(() => void refresh(), 3 * 60 * 1000);
  clockTimer = setInterval(() => { now.value = Date.now(); }, 60 * 1000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (clockTimer) clearInterval(clockTimer);
});

defineExpose({ refresh });
</script>

<style scoped>
.alert-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 1px solid #EAECEF;
  border-radius: 20px;
  background: #FFFFFF;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 14px;
  border-bottom: 1px solid #F0F2F5;
}

.alert-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.alert-title-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #FFF4E5;
}

.alert-heading {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #1E202C;
  line-height: 1.2;
}

.alert-count-badge {
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 800;
  border-radius: 12px;
  background: #E5484D;
}

.alert-content-scroll {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  padding: 14px 16px;
}

.alert-section {
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  margin-bottom: 10px;
}

.text-urgent {
  color: #5F6173;
}

.text-demo {
  color: #5F6173;
}

.alert-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.alert-card {
  padding: 14px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.2s ease;
}

/* URGENT CARD - RED THEME */
.card-urgent {
  background: #FFF0F2;
  border: 1px solid #FFD6DD;
}

.tag-urgent {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #E5484D;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.badge-urgent-time {
  padding: 3px 10px;
  color: #E5484D;
  font-size: 11px;
  font-weight: 700;
  border-radius: 12px;
  background: #FFD6DD;
  white-space: nowrap;
}

/* DEMO OVERDUE CARD - YELLOW THEME */
.card-demo {
  background: #FFFBE6;
  border: 1px solid #FFE58F;
}

.tag-demo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #D48806;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.badge-demo-time {
  padding: 3px 10px;
  color: #D48806;
  font-size: 11px;
  font-weight: 700;
  border-radius: 12px;
  background: #FFF1B8;
  white-space: nowrap;
}

.card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.order-code-link {
  display: inline-block;
  margin: 2px 0 0;
  padding: 0;
  color: #1E202C;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.order-code-link:hover {
  color: #1A6FD4;
  text-decoration: underline;
}

.order-subtext {
  color: #5F6173;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
}

.status-select-box :deep(.v-field) {
  min-height: 36px;
  border-radius: 10px;
  background: #FFFFFF !important;
  box-shadow: none !important;
}

.urgent-select :deep(.v-field) {
  border-color: #FFC0C7 !important;
}

.demo-select :deep(.v-field) {
  border-color: #FFE399 !important;
}

.status-select-box :deep(.v-field__input) {
  min-height: 36px;
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 12.5px;
  font-weight: 700;
  color: #2D3142;
}

.view-all-btn {
  width: calc(100% - 32px);
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 4px 16px 14px;
  color: #1A6FD4;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid #D0E2FF;
  border-radius: 12px;
  background: #FFFFFF;
  cursor: pointer;
  transition: background 0.15s ease;
}

.view-all-btn:hover {
  background: #F0F6FF;
}

.alert-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 14px;
  color: #8C8F9E;
  font-size: 11.5px;
  font-weight: 600;
  border-top: 1px solid #F0F2F5;
  background: #FAFAFC;
}

.alert-state {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: #5F6173;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.alert-state.success {
  flex-direction: column;
  gap: 6px;
}

.alert-state.success small {
  max-width: 220px;
  color: #8C8F9E;
  font-size: 12px;
  line-height: 1.4;
}

.success-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #E8F7EF;
  margin-bottom: 4px;
}

:global(.order-alert-status-menu .v-list-item-title) {
  font-weight: 700 !important;
  font-size: 13px !important;
}
</style>
