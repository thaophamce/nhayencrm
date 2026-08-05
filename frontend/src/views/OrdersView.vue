<template>
  <div v-if="isMobile">
    <MobileOrdersView
      ref="mobileOrdersRef"
      @create="showCreateModal = true"
      @edit="onMobileEdit"
    />
  </div>
  <div class="orders-shell" v-else>
    <aside class="orders-sidebar">
      <nav class="orders-nav">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="orders-nav-link"
            :class="{ 'is-active': activeTab === tab.value }"
            @click="activeTab = tab.value"
          >
            <v-icon :icon="tab.icon" size="18" class="orders-nav-icon" />
            <span>{{ tab.label }}</span>
          </button>
      </nav>
    </aside>


    <section class="orders-main">
      <header class="orders-topbar">
        <div>
          <h1 class="orders-title">Quản lý Đơn hàng thiết kế</h1>
          <p class="orders-subtitle">Theo dõi tiến độ, phân công thiết kế thiệp cưới và tự động tính lương.</p>
        </div>

        <v-btn
          v-if="isAdminOrManager && activeTab === 'list'"
          color="#1A6FD4"
          class="text-white text-capitalize rounded-lg shadow-sm font-weight-bold"
          prepend-icon="mdi-plus"
          @click="showCreateModal = true"
        >
          Tạo đơn mới
        </v-btn>
      </header>

      <main class="orders-content">
        <OrdersOverviewTab v-if="activeTab === 'overview'" @edit="editOrder" />

        <div v-else-if="activeTab === 'list'" class="orders-list-tab">
          <div class="orders-list-main">
            <v-card class="rounded-xl pa-4 mb-4 shadow-sm border">
              <v-row density="comfortable" class="align-center">
                <v-col cols="12" sm="4" md="4" class="py-1">
                  <v-text-field
                    v-model="searchQuery"
                    placeholder="Tìm theo mã đơn hàng..."
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    prepend-inner-icon="mdi-magnify"
                    @input="onSearch"
                    color="#2F80ED"
                    clearable
                  />
                </v-col>

                <v-col cols="6" sm="4" md="3" class="py-1">
                  <v-select
                    v-model="filterStatus"
                    :items="[ { value: null, label: 'Tất cả trạng thái' }, ...statusOptions ]"
                    item-title="label"
                    item-value="value"
                    label="Trạng thái"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    @update:model-value="fetchOrders"
                    color="#2F80ED"
                  />
                </v-col>

                <v-col cols="6" sm="4" md="3" class="py-1" v-if="isAdminOrManager">
                  <v-select
                    v-model="filterDesigner"
                    :items="[ { id: null, fullName: 'Tất cả Designer' }, ...designers ]"
                    item-title="fullName"
                    item-value="id"
                    label="Designer"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    @update:model-value="fetchOrders"
                    color="#2F80ED"
                  />
                </v-col>

                <v-col cols="6" sm="4" md="3" class="py-1">
                  <div class="date-filter-wrap">
                    <span class="date-filter-label">Từ ngày</span>
                    <input v-model="filterDateFrom" type="date" class="date-input" @change="onDateFilter" />
                  </div>
                </v-col>
                <v-col cols="6" sm="4" md="3" class="py-1">
                  <div class="date-filter-wrap">
                    <span class="date-filter-label">Đến ngày</span>
                    <input v-model="filterDateTo" type="date" class="date-input" @change="onDateFilter" />
                  </div>
                </v-col>
                <v-col cols="auto" class="py-1" v-if="filterDateFrom || filterDateTo">
                  <v-btn size="small" variant="text" color="error" @click="clearDateFilter">Xoá lọc ngày</v-btn>
                </v-col>
              </v-row>
            </v-card>

            <v-card class="rounded-xl shadow-sm border overflow-hidden">
              <v-table class="orders-table">
                <thead>
                  <tr>
                    <th class="font-weight-bold">Mã đơn hàng</th>
                    <th class="font-weight-bold" v-if="isAdminOrManager">Khách hàng</th>
                    <th class="font-weight-bold">Trạng thái</th>
                    <th class="font-weight-bold" v-if="isAdminOrManager">Designer phụ trách</th>
                    <th class="font-weight-bold">Hạn chót (Deadline)</th>
                    <th class="font-weight-bold">Số mẫu thiết kế</th>
                    <th class="font-weight-bold" v-if="isAdminOrManager">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="loading && orders.length === 0">
                    <td colspan="7" class="text-center py-4 text-slate-400">Đang tải...</td>
                  </tr>
                  <tr v-else-if="orders.length === 0">
                    <td colspan="7" class="text-center py-4 text-slate-400">Không tìm thấy đơn hàng nào</td>
                  </tr>
                  <tr v-for="order in orders" :key="order.id" v-else>
                    <td class="font-weight-bold text-primary">{{ order.orderCode }}</td>
                    <td v-if="isAdminOrManager">
                      {{ order.conversation?.contact?.fullName || 'Nhóm Zalo' }}
                    </td>
                    <td>
                      <v-chip
                        size="small"
                        class="order-status-chip text-white px-2"
                        :color="getStatusColor(order.status)"
                        variant="flat"
                      >
                        {{ getStatusLabel(order.status) }}
                      </v-chip>
                    </td>
                    <td v-if="isAdminOrManager">
                      {{ order.designer?.fullName || 'Chưa gán' }}
                    </td>
                    <td>{{ formatDeadline(order.deadline) }}</td>
                    <td class="font-weight-medium">{{ order.fileCount }} files</td>
                    <td v-if="isAdminOrManager">
                      <div class="d-flex align-center gap-1">
                        <v-btn
                          icon
                          variant="text"
                          size="small"
                          color="primary"
                          @click="editOrder(order)"
                        >
                          <v-icon size="18">mdi-pencil</v-icon>
                        </v-btn>
                        <v-btn
                          icon
                          variant="text"
                          size="small"
                          color="error"
                          @click="confirmDelete(order)"
                        >
                          <v-icon size="18">mdi-delete</v-icon>
                        </v-btn>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </v-table>

              <div class="d-flex align-center justify-between pa-4 border-t bg-slate-50" v-if="totalPages > 1">
                <span class="text-caption text-slate-500">
                  Hiển thị trang {{ page }} / {{ totalPages }} (Tổng {{ totalCount }} đơn hàng)
                </span>
                <v-pagination
                  v-model="page"
                  :length="totalPages"
                  :total-visible="5"
                  density="compact"
                  @update:model-value="fetchOrders"
                  active-color="#2F80ED"
                />
              </div>
            </v-card>
          </div>

          <aside class="orders-list-sidebar">
            <OrderAlertPanel
              ref="alertPanelRef"
              @edit="editOrder"
              @changed="onAlertChanged"
            />
          </aside>
        </div>

        <DesignerSalaryReport v-else-if="activeTab === 'salary' && authStore.canAccess('orders_salary')" />

        <OrdersReportTab v-else-if="activeTab === 'report'" />
      </main>
    </section>
  </div>

  <CreateOrderModal v-model="showCreateModal" @created="onCreated" />
  <EditOrderModal v-model="showEditModal" :order="selectedOrder" @updated="onUpdated" />
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { useMobile } from '@/composables/use-mobile';
import CreateOrderModal from '@/components/orders/CreateOrderModal.vue';
import EditOrderModal from '@/components/orders/EditOrderModal.vue';
import OrderAlertPanel from '@/components/orders/OrderAlertPanel.vue';
import MobileOrdersView from '@/views/MobileOrdersView.vue';
import DesignerSalaryReport from '@/components/orders/DesignerSalaryReport.vue';
import OrdersOverviewTab from '@/components/orders/OrdersOverviewTab.vue';
import OrdersReportTab from '@/components/orders/OrdersReportTab.vue';
import { ORDER_STATUS_OPTIONS, getOrderStatusLabel, getOrderStatusColor } from '@/constants/order-status';

const toast = useToast();
const authStore = useAuthStore();
const { isMobile } = useMobile();
const mobileOrdersRef = ref<any>(null);
const alertPanelRef = ref<any>(null);

const tabs = computed(() => [
  { value: 'overview', label: 'Tổng quan', icon: 'mdi-view-dashboard-outline' },
  { value: 'list', label: 'Đơn hàng', icon: 'mdi-format-list-bulleted' },
  // Lương thiết kế = nhạy cảm, chỉ nhóm có quyền orders_salary (admin có sẵn qua canAccess).
  ...(authStore.canAccess('orders_salary')
    ? [{ value: 'salary', label: 'Lương thiết kế', icon: 'mdi-cash-multiple' }]
    : []),
  { value: 'report', label: 'Báo cáo', icon: 'mdi-chart-box-outline' },
]);

import { useRoute } from 'vue-router';

const route = useRoute();
const activeTab = ref((route.query.tab as string) || 'overview');

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && typeof newTab === 'string') {
      activeTab.value = newTab;
    }
  },
);
const orders = ref<any[]>([]);
const totalCount = ref(0);
const loading = ref(false);
const page = ref(1);
const limit = 20;

// Filter states
const searchQuery = ref('');
const filterStatus = ref<string | null>(null);
const filterDesigner = ref<string | null>(null);
const filterDateFrom = ref('');
const filterDateTo = ref('');
const designers = ref<any[]>([]);

// Modals
const showCreateModal = ref(false);
const showEditModal = ref(false);
const selectedOrder = ref<any>(null);

const statusOptions = ORDER_STATUS_OPTIONS;

const isAdminOrManager = computed(() => {
  const user = authStore.user;
  return user?.role === 'owner' || user?.role === 'admin' || authStore.canAccess('orders', 'edit');
});

const totalPages = computed(() => Math.ceil(totalCount.value / limit));

onMounted(() => {
  fetchOrders();
  if (isAdminOrManager.value) {
    loadDesigners();
  }
});

let searchTimeout: any = null;
function onSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1;
    fetchOrders();
  }, 400);
}

async function fetchOrders() {
  loading.value = true;
  try {
    const params: any = {
      limit,
      offset: (page.value - 1) * limit,
      search: searchQuery.value || undefined,
      status: filterStatus.value || undefined,
      designerId: filterDesigner.value || undefined,
      dateFrom: filterDateFrom.value || undefined,
      dateTo: filterDateTo.value || undefined,
    };

    const res = await api.get<{ orders: any[]; total: number }>('/orders', { params });
    orders.value = res.data.orders || [];
    totalCount.value = res.data.total || 0;
  } catch (err) {
    console.error('Cannot load orders:', err);
    toast.error('Lỗi khi tải danh sách đơn hàng');
  } finally {
    loading.value = false;
  }
}

function onDateFilter() {
  page.value = 1;
  fetchOrders();
}

function clearDateFilter() {
  filterDateFrom.value = '';
  filterDateTo.value = '';
  fetchOrders();
}

async function loadDesigners() {
  try {
    const res = await api.get<{ users?: Array<{ id: string; fullName: string }> }>('/users');
    designers.value = res.data.users || [];
  } catch (err) {
    console.error('Cannot load designers:', err);
  }
}

function editOrder(order: any) {
  selectedOrder.value = order;
  showEditModal.value = true;
}

function onMobileEdit(order: any) {
  selectedOrder.value = order;
  showEditModal.value = true;
}

function onCreated() {
  fetchOrders();
  alertPanelRef.value?.refresh();
  mobileOrdersRef.value?.refresh();
}

function onUpdated() {
  fetchOrders();
  alertPanelRef.value?.refresh();
  mobileOrdersRef.value?.refresh();
}

function onAlertChanged() {
  fetchOrders();
}

async function confirmDelete(order: any) {
  if (confirm(`Bạn có chắc chắn muốn xóa đơn hàng ${order.orderCode} không?`)) {
    try {
      await api.delete(`/orders/${order.id}`);
      toast.success('Xóa đơn hàng thành công');
      fetchOrders();
      alertPanelRef.value?.refresh();
    } catch (err) {
      toast.error('Xóa đơn hàng thất bại');
    }
  }
}

function getStatusLabel(s: string) {
  return getOrderStatusLabel(s);
}

function getStatusColor(s: string) {
  return getOrderStatusColor(s);
}

function formatDeadline(d: string) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

</script>

<style scoped>
.orders-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  height: calc(100vh - var(--smax-topnav-h, 48px));
  min-height: 0;
  overflow: hidden;
  background: #1A6FD4;
}
.orders-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 18px 24px;
  background: #FFFFFF;
  border-bottom: 1px solid #EAECEF;
  flex: 0 0 auto;
}
.orders-title {
  font-size: 20px;
  font-weight: 700;
  color: #1E202C;
  margin: 0;
}
.orders-subtitle {
  font-size: 12.5px;
  color: #5F6173;
  margin: 2px 0 0;
}
.orders-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #F7F8FC;
  border-top-left-radius: 24px;
  overflow: hidden;
}
.orders-sidebar {
  min-width: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.16);
  background: #1A6FD4;
  padding: 12px 8px;
  overflow-y: auto;
}
.orders-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.orders-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.orders-nav-link:hover {
  background: rgba(255, 255, 255, 0.12);
}
.orders-nav-link.is-active {
  background: rgba(255, 255, 255, 0.20);
  color: #FFFFFF;
  box-shadow: inset 3px 0 0 #FFFFFF;
  font-weight: 700;
}
.orders-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
}
.orders-list-tab {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  width: 100%;
}
.orders-list-main {
  flex: 1 1 0%;
  min-width: 0;
}
.orders-list-sidebar {
  width: 320px;
  flex: 0 0 320px;
  min-width: 0;
  position: sticky;
  top: 0;
}
@media (max-width: 1280px) {
  .orders-list-tab {
    flex-direction: column;
  }
  .orders-list-sidebar {
    width: 100%;
    flex: none;
    position: static;
  }
}
.urgent-row {
  background-color: #EBF3FF !important;
}
.urgent-row td {
  color: #c62828 !important;
}
.orders-table th {
  font-size: 13px !important;
}
.orders-table td {
  font-size: 13.5px !important;
}
@media (max-width: 768px) {
  .orders-shell {
    display: flex;
    flex-direction: column;
  }
  .orders-sidebar {
    flex: 0 0 auto;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  }
  .orders-nav {
    flex-direction: row;
    overflow-x: auto;
  }
}
.order-status-chip { font-weight: 800 !important; color: #fff !important; opacity: 1 !important; }
.date-filter-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.date-filter-label {
  font-size: 11px;
  color: #64748B;
  font-weight: 600;
  padding-left: 2px;
}
.date-input {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  font-size: 13.5px;
  color: #1E202C;
  outline: none;
  background: #fff;
  cursor: pointer;
}
.date-input:focus {
  border-color: #2F80ED;
  box-shadow: 0 0 0 2px rgba(47,128,237,0.15);
}
</style>
