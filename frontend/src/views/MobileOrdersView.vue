<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="cl-mobile-orders pa-3" style="min-height: calc(100vh - 120px); background: #F8FAFC;">
    <!-- Top Search & Title -->
    <div class="cl-orders-header mb-3 px-1">
      <div class="cl-orders-title">Đơn hàng</div>
      <v-btn
        v-if="isAdminOrManager"
        icon
        color="primary"
        size="small"
        rounded="xl"
        elevation="1"
        @click="triggerCreate"
        class="cl-orders-add-btn"
      >
        <v-icon size="20">mdi-plus</v-icon>
      </v-btn>
    </div>

    <!-- Search Input -->
    <v-text-field
      v-model="searchQuery"
      placeholder="Tìm theo mã đơn..."
      variant="solo"
      flat
      density="compact"
      rounded="lg"
      hide-details
      prepend-inner-icon="mdi-magnify"
      class="mb-3 cl-orders-search"
      bg-color="white"
    />

    <!-- Filter chips -->
    <div class="cl-filter-container mb-4">
      <span
        class="cl-filter-chip"
        :class="{ active: activeStatus === null }"
        @click="setStatusFilter(null)"
      >Tất cả</span>
      <span
        class="cl-filter-chip demo"
        :class="{ active: activeStatus === 'demo' }"
        @click="setStatusFilter('demo')"
      >Chưa demo</span>
      <span
        class="cl-filter-chip designing"
        :class="{ active: activeStatus === 'designing' }"
        @click="setStatusFilter('designing')"
      >Đang thiết kế</span>
      <span
        class="cl-filter-chip approved"
        :class="{ active: activeStatus === 'approved' }"
        @click="setStatusFilter('approved')"
      >Chốt in</span>
      <span
        class="cl-filter-chip cancelled"
        :class="{ active: activeStatus === 'cancelled' }"
        @click="setStatusFilter('cancelled')"
      >Khách huỷ</span>
    </div>

    <!-- Cards List -->
    <div v-if="loading && orders.length === 0" class="d-flex flex-column gap-3">
      <div v-for="i in 5" :key="i" class="cl-order-skeleton"></div>
    </div>
    <div v-else-if="orders.length === 0" class="d-flex flex-column align-center justify-center py-12 text-slate-400">
      <v-icon size="48" class="mb-2">mdi-package-variant</v-icon>
      <span class="text-body-2">Không tìm thấy đơn hàng nào</span>
    </div>
    <div v-else class="d-flex flex-column gap-3">
      <div
        v-for="order in orders"
        :key="order.id"
        class="cl-order-card"
        @click="viewDetail(order)"
      >
        <div class="d-flex justify-between align-start mb-2">
          <div class="d-flex flex-column">
            <span class="text-subtitle-2 font-weight-bold text-primary">{{ order.orderCode }}</span>
            <span class="text-body-2 font-weight-bold text-slate-900 mt-1">
              {{ order.conversation?.contact?.fullName || 'Nhóm Zalo' }}
            </span>
          </div>
          <!-- Status pill — click để đổi trạng thái nếu có quyền edit -->
          <v-menu v-if="canEditOrders" location="bottom end" :close-on-content-click="true">
            <template #activator="{ props: menuProps }">
              <span
                class="cl-status-pill"
                :class="order.status"
                v-bind="menuProps"
                @click.stop
                style="cursor: pointer; user-select: none;"
              >
                {{ getStatusText(order.status) }}
                <v-icon size="10" class="ml-1" style="vertical-align: middle;">mdi-chevron-down</v-icon>
              </span>
            </template>
            <v-list density="compact" min-width="150" rounded="lg" elevation="4">
              <v-list-item
                v-for="s in STATUS_OPTIONS"
                :key="s.value"
                :disabled="order.status === s.value || updatingId === order.id"
                @click="changeStatus(order, s.value)"
              >
                <span class="cl-status-pill" :class="s.value" style="font-size: 11px;">{{ s.label }}</span>
              </v-list-item>
            </v-list>
          </v-menu>
          <span v-else class="cl-status-pill" :class="order.status">
            {{ getStatusText(order.status) }}
          </span>
        </div>

        <div class="d-flex justify-between align-end mt-3 text-caption text-slate-500">
          <div class="d-flex gap-3">
            <span>👤 {{ order.designer?.fullName || 'Chưa gán' }}</span>
            <span>📅 {{ formatDateShort(order.deadline) }}</span>
          </div>
          <div class="d-flex align-center gap-1">
            <span>📎 {{ order.fileCount }} Files</span>
            <v-icon size="16" class="text-slate-400">mdi-chevron-right</v-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- Load more trigger -->
    <div v-if="hasMore" class="text-center mt-4">
      <v-btn
        variant="text"
        size="small"
        color="primary"
        class="font-weight-bold"
        :loading="loading"
        @click="loadMore"
      >
        Xem thêm đơn hàng
      </v-btn>
    </div>

    <!-- Order Detail Bottom Sheet -->
    <v-bottom-sheet
      v-model="showDetailSheet"
      scrollable
      max-width="480px"
      content-class="cl-profile-sheet"
    >
      <v-card class="cl-sheet-card" v-if="selectedOrder">
        <div class="cl-drag-handle"></div>

        <div class="pa-4 d-flex justify-between align-center cl-header-border">
          <div>
            <div class="text-h6 font-weight-bold text-slate-900">{{ selectedOrder.orderCode }}</div>
            <div class="text-caption text-slate-500">Ngày tạo: {{ formatDate(selectedOrder.createdAt) }}</div>
          </div>
          <v-menu v-if="canEditOrders" location="bottom end" :close-on-content-click="true">
            <template #activator="{ props: menuProps }">
              <span
                class="cl-status-pill"
                :class="selectedOrder.status"
                v-bind="menuProps"
                style="cursor: pointer; user-select: none;"
              >
                {{ getStatusText(selectedOrder.status) }}
                <v-icon size="10" class="ml-1" style="vertical-align: middle;">mdi-chevron-down</v-icon>
              </span>
            </template>
            <v-list density="compact" min-width="150" rounded="lg" elevation="4">
              <v-list-item
                v-for="s in STATUS_OPTIONS"
                :key="s.value"
                :disabled="selectedOrder.status === s.value || updatingId === selectedOrder.id"
                @click="changeStatus(selectedOrder, s.value)"
              >
                <span class="cl-status-pill" :class="s.value" style="font-size: 11px;">{{ s.label }}</span>
              </v-list-item>
            </v-list>
          </v-menu>
          <span v-else class="cl-status-pill" :class="selectedOrder.status">
            {{ getStatusText(selectedOrder.status) }}
          </span>
        </div>

        <v-card-text class="pa-4 overflow-y-auto" style="max-height: 60vh;">
          <div class="d-flex flex-column gap-3 mb-4">
            <div class="cl-detail-group">
              <span class="cl-detail-label">Khách hàng</span>
              <span class="cl-detail-value">{{ selectedOrder.conversation?.contact?.fullName || 'Không có' }}</span>
            </div>
            <div class="cl-detail-group" v-if="selectedOrder.conversation?.contact?.phone">
              <span class="cl-detail-label">Số điện thoại</span>
              <a :href="'tel:' + selectedOrder.conversation.contact.phone" class="cl-detail-value text-primary font-weight-bold">
                {{ selectedOrder.conversation.contact.phone }}
              </a>
            </div>
            <div class="cl-detail-group">
              <span class="cl-detail-label">Designer phụ trách</span>
              <span class="cl-detail-value">{{ selectedOrder.designer?.fullName || 'Chưa gán' }}</span>
            </div>
            <div class="cl-detail-group">
              <span class="cl-detail-label">Hạn chót (Deadline)</span>
              <span class="cl-detail-value">{{ formatDate(selectedOrder.deadline) }}</span>
            </div>
            <div class="cl-detail-group">
              <span class="cl-detail-label">Số mẫu thiết kế</span>
              <span class="cl-detail-value font-weight-bold">{{ selectedOrder.fileCount }} Files</span>
            </div>
            <div class="cl-detail-group" v-if="selectedOrder.notes">
              <span class="cl-detail-label">Ghi chú đơn hàng</span>
              <span class="cl-detail-value text-slate-600 bg-slate-50 pa-2 rounded border">{{ selectedOrder.notes }}</span>
            </div>
          </div>

          <!-- Timeline -->
          <div class="text-subtitle-2 font-weight-bold text-slate-800 mb-2">Tiến trình đơn hàng</div>
          <div class="cl-timeline pl-2 mb-4">
            <div
              v-for="hist in selectedOrder.statusHistory"
              :key="hist.id"
              class="cl-timeline-item"
            >
              <div class="cl-timeline-dot"></div>
              <div class="cl-timeline-content">
                <div class="text-caption font-weight-bold text-slate-800">
                  {{ getStatusText(hist.status) }}
                </div>
                <div class="text-caption text-slate-500">
                  Cập nhật bởi {{ hist.changedBy?.fullName || 'Hệ thống' }} vào {{ formatDate(hist.changedAt) }}
                </div>
              </div>
            </div>
          </div>
        </v-card-text>

        <!-- Actions -->
        <div class="pa-4 d-flex gap-2 border-t bg-white">
          <v-btn
            v-if="canEditOrders"
            variant="tonal"
            color="primary"
            rounded="xl"
            class="flex-1 font-weight-semibold"
            size="small"
            @click="triggerEdit"
          >
            Chỉnh sửa
          </v-btn>
          <v-btn
            variant="tonal"
            color="grey-darken-1"
            rounded="xl"
            class="flex-1 font-weight-semibold"
            size="small"
            @click="showDetailSheet = false"
          >
            Đóng
          </v-btn>
        </div>
      </v-card>
    </v-bottom-sheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const canEditOrders = computed(() => authStore.canAccess('orders', 'edit'));

const STATUS_OPTIONS = [
  { value: 'demo', label: 'Chưa demo' },
  { value: 'designing', label: 'Đang thiết kế' },
  { value: 'approved', label: 'Chốt in' },
  { value: 'cancelled', label: 'Khách huỷ' },
];

const updatingId = ref<string | null>(null);

async function changeStatus(order: any, newStatus: string) {
  if (updatingId.value) return;
  updatingId.value = order.id;
  const oldStatus = order.status;
  // Optimistic update
  order.status = newStatus;
  if (selectedOrder.value?.id === order.id) selectedOrder.value.status = newStatus;
  try {
    await api.patch(`/orders/${order.id}`, { status: newStatus });
  } catch (err) {
    // Revert on error
    order.status = oldStatus;
    if (selectedOrder.value?.id === order.id) selectedOrder.value.status = oldStatus;
    console.error('Update status error:', err);
  } finally {
    updatingId.value = null;
  }
}

const orders = ref<any[]>([]);
const loading = ref(false);
const searchQuery = ref('');
const activeStatus = ref<string | null>(null);

const page = ref(1);
const limit = 20;
const hasMore = ref(false);

const showDetailSheet = ref(false);
const selectedOrder = ref<any>(null);

const emit = defineEmits(['create', 'edit']);

const isAdminOrManager = computed(() => {
  const user = authStore.user;
  return user?.role === 'owner' || user?.role === 'admin' || authStore.canAccess('user');
});

async function fetchOrders(append = false) {
  loading.value = true;
  try {
    const params: any = {
      limit,
      offset: (page.value - 1) * limit,
    };
    if (searchQuery.value) {
      params.search = searchQuery.value;
    }
    if (activeStatus.value) {
      params.status = activeStatus.value;
    }

    const { data } = await api.get<{ orders: any[]; total: number }>('/orders', { params });
    const fetched = data.orders || [];

    if (append) {
      orders.value = [...orders.value, ...fetched];
    } else {
      orders.value = fetched;
    }

    hasMore.value = orders.value.length < (data.total || 0);
  } catch (err) {
    console.error('Fetch orders error:', err);
  } finally {
    loading.value = false;
  }
}

function setStatusFilter(status: string | null) {
  activeStatus.value = status;
  page.value = 1;
  fetchOrders();
}

function loadMore() {
  if (loading.value) return;
  page.value += 1;
  fetchOrders(true);
}

function viewDetail(order: any) {
  selectedOrder.value = order;
  showDetailSheet.value = true;
}

function triggerCreate() {
  emit('create');
}

function triggerEdit() {
  showDetailSheet.value = false;
  emit('edit', selectedOrder.value);
}

let searchTimeout: any = null;
watch(searchQuery, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1;
    fetchOrders();
  }, 300);
});

function formatDateShort(dateStr: string) {
  if (!dateStr) return 'Chưa có';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function formatDate(dateStr: string) {
  if (!dateStr) return 'Chưa có';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusText(status: string) {
  switch (status) {
    case 'demo': return 'Chưa demo';
    case 'designing': return 'Đang thiết kế';
    case 'approved': return 'Chốt in';
    case 'cancelled': return 'Khách huỷ';
    default: return status;
  }
}

defineExpose({
  refresh: () => {
    page.value = 1;
    fetchOrders();
  }
});

onMounted(() => {
  fetchOrders();
});
</script>

<style scoped>
.cl-mobile-orders {
  display: flex;
  flex-direction: column;
}
.cl-orders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.cl-orders-title {
  font-size: 20px;
  font-weight: 700;
  color: #0F172A;
  font-family: 'Quicksand', sans-serif;
}
.cl-orders-add-btn {
  margin: 0 !important;
  flex-shrink: 0 !important;
}
.cl-orders-search {
  flex: none !important;
}
.cl-orders-search :deep(.v-field) {
  border-radius: 10px !important;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.02) !important;
  border: 1px solid #E2E8F0 !important;
  font-size: 13px !important;
  height: 36px !important;
}
.cl-orders-search :deep(.v-field__input) {
  min-height: 36px !important;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
  height: 36px !important;
}
.cl-orders-search :deep(.v-field__prepend-inner),
.cl-orders-search :deep(.v-field__clearable) {
  align-items: center !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  height: 36px !important;
}
.cl-orders-search :deep(.v-input__control) {
  min-height: 36px !important;
}
.cl-filter-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px;
}
.cl-filter-container::-webkit-scrollbar {
  height: 0;
}
.cl-filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1.5px solid #E2E8F0;
  background: #F8FAFC;
  color: #64748B;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s ease-in-out;
}
.cl-filter-chip.active {
  background: #2563EB;
  color: #fff;
  border-color: #2563EB;
}
.cl-filter-chip.active.demo { background: #FFB74D; border-color: #FFB74D; }
.cl-filter-chip.active.designing { background: #64B5F6; border-color: #64B5F6; }
.cl-filter-chip.active.approved { background: #81C784; border-color: #81C784; }
.cl-filter-chip.active.cancelled { background: #E57373; border-color: #E57373; }

.cl-order-card {
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
  cursor: pointer;
  transition: all 0.2s ease;
}
.theme--dark .cl-order-card {
  background: #1E293B;
  border-color: #334155;
}
.cl-order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
}
.cl-status-pill {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 10px;
  color: #FFFFFF;
}
.cl-status-pill.demo { background: #F57C00; }
.cl-status-pill.designing { background: #2F80ED; }
.cl-status-pill.approved { background: #34A853; }
.cl-status-pill.cancelled { background: #E5484D; }

.cl-order-skeleton {
  height: 100px;
  background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
  background-size: 200% 100%;
  animation: loading-animation 1.5s infinite;
  border-radius: 18px;
}
@keyframes loading-animation {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.cl-profile-sheet {
  border-top-left-radius: 28px !important;
  border-top-right-radius: 28px !important;
  overflow: hidden;
}
.cl-sheet-card {
  border-top-left-radius: 28px !important;
  border-top-right-radius: 28px !important;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
}
.theme--dark .cl-sheet-card {
  background: #0F172A;
}
.cl-drag-handle {
  width: 36px;
  height: 5px;
  background: #CBD5E1;
  border-radius: 3px;
  margin: 12px auto 4px auto;
  flex-shrink: 0;
}
.cl-header-border {
  border-bottom: 1px solid #F1F5F9;
}
.cl-detail-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cl-detail-label {
  font-size: 12px;
  color: #64748B;
  font-weight: 500;
}
.cl-detail-value {
  font-size: 14px;
  color: #0F172A;
  font-weight: 600;
}
.theme--dark .cl-detail-value {
  color: #F8FAFC;
}

/* Timeline */
.cl-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
}
.cl-timeline::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: #E2E8F0;
}
.theme--dark .cl-timeline::before {
  background: #334155;
}
.cl-timeline-item {
  display: flex;
  gap: 16px;
  position: relative;
  z-index: 1;
}
.cl-timeline-dot {
  width: 14px;
  height: 14px;
  background: #2563EB;
  border: 3px solid #FFFFFF;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px #93C5FD;
}
.cl-timeline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
