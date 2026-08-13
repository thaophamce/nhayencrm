<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="dop-wrap">
    <!-- Header -->
    <div class="dop-header">
      <span class="dop-title">Đơn thiết kế</span>
      <button class="dop-add-btn" @click="showCreateModal = true">
        <v-icon size="15">mdi-plus</v-icon> Tạo đơn mới
      </button>
    </div>

    <!-- Search -->
    <div class="dop-search-row">
      <v-text-field
        v-model="searchQuery"
        placeholder="Tìm theo mã đơn..."
        variant="solo"
        flat
        density="compact"
        hide-details
        prepend-inner-icon="mdi-magnify"
        clearable
        class="dop-search"
        bg-color="white"
        rounded="lg"
      />
    </div>

    <!-- Status chips -->
    <div class="dop-chips">
      <button class="dop-chip" :class="{ active: !filterStatus }" @click="setStatus(null)">Tất cả</button>
      <button class="dop-chip demo" :class="{ active: filterStatus === 'demo' }" @click="setStatus('demo')">Chưa demo</button>
      <button class="dop-chip designing" :class="{ active: filterStatus === 'designing' }" @click="setStatus('designing')">Thiết kế</button>
      <button class="dop-chip approved" :class="{ active: filterStatus === 'approved' }" @click="setStatus('approved')">Chốt in</button>
      <button class="dop-chip cancelled" :class="{ active: filterStatus === 'cancelled' }" @click="setStatus('cancelled')">Huỷ</button>
    </div>

    <!-- Designer + date toggle (admin only) -->
    <div v-if="isAdminOrManager" class="dop-filter-row">
      <select v-model="filterDesigner" class="dop-select" @change="fetchOrders()">
        <option value="">Tất cả Designer</option>
        <option v-for="d in designers" :key="d.id" :value="d.id">{{ d.fullName }}</option>
      </select>
      <button class="dop-date-toggle" :class="{ active: showDateFilter }" @click="showDateFilter = !showDateFilter">
        <v-icon size="14">mdi-calendar</v-icon>
      </button>
    </div>

    <!-- Date range (collapsible) -->
    <div v-if="showDateFilter" class="dop-date-row">
      <input v-model="filterDateFrom" type="date" class="dop-date-input" @change="fetchOrders()" />
      <span class="dop-date-sep">→</span>
      <input v-model="filterDateTo" type="date" class="dop-date-input" @change="fetchOrders()" />
      <button v-if="filterDateFrom || filterDateTo" class="dop-date-clear" @click="clearDates">×</button>
    </div>

    <!-- Card list -->
    <div class="dop-list">
      <div v-if="loading && orders.length === 0" class="dop-skeletons">
        <div v-for="i in 5" :key="i" class="dop-skeleton"></div>
      </div>
      <div v-else-if="orders.length === 0" class="dop-empty">
        <v-icon size="40" color="#CBD5E1">mdi-package-variant</v-icon>
        <span>Không có đơn hàng nào</span>
      </div>
      <template v-else>
        <div v-for="order in orders" :key="order.id" class="dop-card" @click="editOrder(order)">
          <div class="dop-card-top">
            <div class="dop-card-left">
              <span class="dop-order-code">{{ order.orderCode }}</span>
            </div>
            <v-menu v-if="canEditOrders" location="bottom end" :close-on-content-click="true">
              <template #activator="{ props: menuProps }">
                <span
                  class="dop-status-pill"
                  :class="order.status"
                  v-bind="menuProps"
                  @click.stop
                  style="cursor: pointer; user-select: none;"
                >
                  {{ getStatusLabel(order.status) }}
                  <v-icon size="10" style="vertical-align: middle; margin-left: 2px;">mdi-chevron-down</v-icon>
                </span>
              </template>
              <v-list density="compact" min-width="140" rounded="lg" elevation="4">
                <v-list-item
                  v-for="s in STATUS_OPTIONS"
                  :key="s.value"
                  :disabled="order.status === s.value || updatingId === order.id"
                  @click="changeStatus(order, s.value)"
                >
                  <span class="dop-status-pill" :class="s.value" style="font-size: 12px;">{{ s.label }}</span>
                </v-list-item>
              </v-list>
            </v-menu>
            <span v-else class="dop-status-pill" :class="order.status">{{ getStatusLabel(order.status) }}</span>
          </div>
          <div class="dop-card-bottom">
            <span class="dop-designer">{{ order.designer?.fullName || 'Chưa gán' }}</span>
            <span>📅 {{ formatDate(order.deadline) }}</span>
            <span>📎 {{ order.fileCount }} files</span>
          </div>
        </div>
        <div v-if="hasMore" class="dop-loadmore">
          <button class="dop-loadmore-btn" :disabled="loading" @click="loadMore">
            {{ loading ? 'Đang tải...' : 'Xem thêm' }}
          </button>
        </div>
      </template>
    </div>
  </div>

  <CreateOrderModal v-model="showCreateModal" @created="onCreated" />
  <EditOrderModal v-model="showEditModal" :order="selectedOrder" @updated="onUpdated" />
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { extractDesignOrderCode } from '@/utils/design-order-search';
import CreateOrderModal from '@/components/orders/CreateOrderModal.vue';
import EditOrderModal from '@/components/orders/EditOrderModal.vue';

const props = defineProps<{
  conversationId: string;
  conversationName?: string | null;
}>();

interface Designer { id: string; fullName: string }
interface Order {
  id: string;
  orderCode: string;
  status: string;
  deadline: string | null;
  fileCount: number;
  designer: { fullName: string } | null;
  conversation: { contact: { fullName: string } | null } | null;
}

const auth = useAuthStore();
const isAdminOrManager = computed(() => ['admin', 'manager'].includes(auth.user?.role ?? ''));
const canEditOrders = computed(() => auth.canAccess('orders', 'edit'));

const STATUS_OPTIONS = [
  { value: 'demo', label: 'Chưa demo' },
  { value: 'designing', label: 'Đang thiết kế' },
  { value: 'approved', label: 'Chốt in' },
  { value: 'cancelled', label: 'Huỷ' },
];

const updatingId = ref<string | null>(null);

async function changeStatus(order: Order, newStatus: string) {
  if (updatingId.value) return;
  updatingId.value = order.id;
  const old = order.status;
  order.status = newStatus; // optimistic
  try {
    await api.patch(`/orders/${order.id}`, { status: newStatus });
  } catch (err) {
    order.status = old; // revert on error
    console.error('[DesignOrderTabPanel] changeStatus error', err);
  } finally {
    updatingId.value = null;
  }
}

const LIMIT = 20;
const orders = ref<Order[]>([]);
const loading = ref(false);
const hasMore = ref(false);
const offset = ref(0);
let latestFetchId = 0;

const searchQuery = ref(extractDesignOrderCode(props.conversationName));
const filterStatus = ref<string | null>(null);
const filterDesigner = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');
const showDateFilter = ref(false);

const showCreateModal = ref(false);
const showEditModal = ref(false);
const selectedOrder = ref<Order | null>(null);

const designers = ref<Designer[]>([]);

async function loadDesigners() {
  try {
    const res = await api.get('/users', { params: { role: 'designer', limit: 100 } });
    designers.value = res.data?.users ?? res.data ?? [];
  } catch { /* non-fatal */ }
}

async function fetchOrders(reset = true) {
  const fetchId = ++latestFetchId;
  if (reset) { orders.value = []; offset.value = 0; }
  loading.value = true;
  try {
    const res = await api.get('/orders', {
      params: {
        limit: LIMIT,
        offset: offset.value,
        search: searchQuery.value || undefined,
        status: filterStatus.value || undefined,
        designerId: filterDesigner.value || undefined,
        dateFrom: filterDateFrom.value || undefined,
        dateTo: filterDateTo.value || undefined,
      },
    });
    if (fetchId !== latestFetchId) return;
    const rows: Order[] = res.data?.orders ?? res.data?.items ?? [];
    if (reset) {
      orders.value = rows;
    } else {
      orders.value.push(...rows);
    }
    hasMore.value = rows.length === LIMIT;
  } catch (err) {
    if (fetchId !== latestFetchId) return;
    console.error('[DesignOrderTabPanel] fetchOrders error', err);
  } finally {
    if (fetchId === latestFetchId) loading.value = false;
  }
}

async function loadMore() {
  offset.value += LIMIT;
  await fetchOrders(false);
}

function setStatus(s: string | null) {
  filterStatus.value = s;
  fetchOrders();
}

function editOrder(order: Order) {
  selectedOrder.value = order;
  showEditModal.value = true;
}

function onCreated() { fetchOrders(); }
function onUpdated() { fetchOrders(); }

function clearDates() {
  filterDateFrom.value = '';
  filterDateTo.value = '';
  fetchOrders();
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  demo: 'Chưa demo',
  designing: 'Đang thiết kế',
  approved: 'Chốt in',
  cancelled: 'Huỷ',
};
function getStatusLabel(s: string) { return STATUS_LABELS[s] ?? s; }

// Search debounce
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, () => {
  // Vô hiệu hoá ngay request của hội thoại trước, không để kết quả cũ ghi đè trong lúc debounce.
  latestFetchId += 1;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchOrders(), 350);
});

// Khi sale đổi hội thoại trong lúc tab đang mở, đồng bộ mã mới vào ô tìm kiếm.
// Gán lại searchQuery cũng kích hoạt chính debounce bên trên để tự tìm ngay.
watch(() => props.conversationName, (name) => {
  searchQuery.value = extractDesignOrderCode(name);
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  latestFetchId += 1;
});

// Initial load
fetchOrders();
if (isAdminOrManager.value) loadDesigners();
</script>

<style scoped>
.dop-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #f8fafc;
}

.dop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  flex-shrink: 0;
}
.dop-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}
.dop-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: #1a6fd4;
  border: none;
  border-radius: 20px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.12s;
}
.dop-add-btn:hover { background: #1565c0; }

.dop-search-row {
  padding: 0 10px 6px;
  flex-shrink: 0;
}
.dop-search { font-size: 16px !important; }

.dop-chips {
  display: flex;
  gap: 5px;
  padding: 0 10px 6px;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
}
.dop-chips::-webkit-scrollbar { display: none; }
.dop-chip {
  font-size: 15px;
  white-space: nowrap;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  transition: all 0.12s;
  color: #475569;
}
.dop-chip:hover { border-color: #94a3b8; }
.dop-chip.active { background: #1e293b; color: #fff; border-color: #1e293b; }
.dop-chip.demo.active { background: #f59e0b; border-color: #f59e0b; }
.dop-chip.designing.active { background: #3b82f6; border-color: #3b82f6; }
.dop-chip.approved.active { background: #10b981; border-color: #10b981; }
.dop-chip.cancelled.active { background: #ef4444; border-color: #ef4444; }

.dop-filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 6px;
  flex-shrink: 0;
}
.dop-select {
  flex: 1;
  font-size: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px 8px;
  background: #fff;
  color: #475569;
  outline: none;
  cursor: pointer;
}
.dop-select:focus { border-color: #94a3b8; }
.dop-date-toggle {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #64748b;
  flex-shrink: 0;
  transition: all 0.12s;
}
.dop-date-toggle:hover,
.dop-date-toggle.active { background: #eff6ff; border-color: #93c5fd; color: #1a6fd4; }

.dop-date-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px 6px;
  flex-shrink: 0;
}
.dop-date-input {
  flex: 1;
  font-size: 15px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 3px 6px;
  background: #fff;
  color: #374151;
  outline: none;
  min-width: 0;
}
.dop-date-input:focus { border-color: #94a3b8; }
.dop-date-sep { color: #94a3b8; font-size: 16px; flex-shrink: 0; }
.dop-date-clear {
  font-size: 18px;
  color: #94a3b8;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.dop-date-clear:hover { color: #ef4444; }

.dop-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 10px;
  scrollbar-width: thin;
  scrollbar-color: #e2e8f0 transparent;
}

.dop-skeletons { display: flex; flex-direction: column; gap: 8px; }
.dop-skeleton {
  height: 72px;
  border-radius: 10px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: dop-shimmer 1.4s infinite;
}
@keyframes dop-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.dop-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: #94a3b8;
  font-size: 17px;
}

.dop-card {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: box-shadow 0.12s, border-color 0.12s;
}
.dop-card:hover { border-color: #bfdbfe; box-shadow: 0 2px 8px rgba(41,98,255,0.07); }

.dop-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}
.dop-card-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dop-order-code {
  font-size: 17px;
  font-weight: 600;
  color: #1a6fd4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dop-customer {
  font-size: 15px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dop-status-pill {
  font-size: 14px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
  background: #94a3b8;
  color: #fff;
}
.dop-status-pill.demo      { background: #f97316; }
.dop-status-pill.designing { background: #1a6fd4; }
.dop-status-pill.approved  { background: #10b981; }
.dop-status-pill.cancelled { background: #ef4444; }

.dop-card-bottom {
  display: flex;
  gap: 10px;
  font-size: 15px;
  color: #64748b;
  flex-wrap: wrap;
}
.dop-designer { font-weight: 700; color: #1e293b; }

.dop-loadmore {
  display: flex;
  justify-content: center;
  padding: 4px 0 2px;
}
.dop-loadmore-btn {  font-size: 16px;
  color: #1a6fd4;
  background: none;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 5px 20px;
  cursor: pointer;
  transition: background 0.12s;
}
.dop-loadmore-btn:hover:not(:disabled) { background: #eff6ff; }
.dop-loadmore-btn:disabled { opacity: 0.5; cursor: default; }
</style>
