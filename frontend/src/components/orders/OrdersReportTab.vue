<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="orders-report">
    <!-- Bộ lọc -->
    <v-card class="rounded-xl pa-4 mb-4 shadow-sm border">
      <v-row density="comfortable" class="align-center">
        <v-col cols="12" sm="4" md="3" class="py-1">
          <v-text-field
            v-model="fromDate"
            type="date"
            label="Từ ngày"
            variant="outlined"
            density="compact"
            hide-details
            color="#2F80ED"
            @update:model-value="fetchOrders"
          />
        </v-col>
        <v-col cols="12" sm="4" md="3" class="py-1">
          <v-text-field
            v-model="toDate"
            type="date"
            label="Đến ngày"
            variant="outlined"
            density="compact"
            hide-details
            color="#2F80ED"
            @update:model-value="fetchOrders"
          />
        </v-col>
        <v-col v-if="isAdminOrManager" cols="12" sm="4" md="3" class="py-1">
          <v-select
            v-model="filterDesigner"
            :items="designers"
            item-title="fullName"
            item-value="id"
            label="Designer"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            color="#2F80ED"
            @update:model-value="fetchOrders"
          />
        </v-col>
        <v-col cols="12" sm="4" md="3" class="py-1">
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            item-title="label"
            item-value="value"
            label="Trạng thái"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            color="#2F80ED"
            @update:model-value="fetchOrders"
          />
        </v-col>
      </v-row>
    </v-card>

    <div v-if="loading" class="d-flex justify-center align-center py-10">
      <v-progress-circular indeterminate color="#2F80ED" />
    </div>

    <template v-else>
      <div v-if="!groupedOrders.length" class="text-center py-10 text-grey-darken-1 text-body-2">
        Không có đơn hàng nào trong khoảng thời gian này.
      </div>

      <!-- Nhóm theo ngày -->
      <div v-for="group in groupedOrders" :key="group.date" class="mb-4">
        <div class="d-flex align-center gap-2 mb-2">
          <v-icon color="#2F80ED" size="18">mdi-calendar</v-icon>
          <span class="font-weight-bold text-body-2">{{ group.dateLabel }}</span>
          <v-chip size="x-small" color="#2F80ED" variant="tonal">{{ group.orders.length }} đơn</v-chip>
        </div>
        <v-row dense>
          <v-col v-for="order in group.orders" :key="order.id" cols="12" sm="6" md="4" lg="3">
            <v-card class="order-card rounded-xl pa-3 shadow-sm border" :class="{ 'urgent-card': order.isUrgent }" @click="editOrder(order)">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="font-weight-bold text-body-2">
                  <span v-if="order.isUrgent">🚨 </span>{{ order.orderCode }}
                </span>
                <v-chip size="x-small" :color="getStatusColor(order.status)" class="text-white font-weight-black">
                  {{ getStatusLabel(order.status) }}
                </v-chip>
              </div>
              <div class="text-caption text-grey-darken-1">Số file: <b>{{ order.fileCount }}</b></div>
              <div class="text-caption text-grey-darken-1">
                Designer:
                <span v-if="order.designer">{{ order.designer.fullName }}</span>
                <span v-else class="italic">Chưa gán</span>
              </div>
              <div v-if="order.notes" class="text-caption text-grey-darken-2 text-truncate mt-1" :title="order.notes">
                {{ order.notes }}
              </div>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </template>

    <EditOrderModal v-model="showEditModal" :order="selectedOrder" @updated="fetchOrders" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import EditOrderModal from '@/components/orders/EditOrderModal.vue';
import { ORDER_STATUS_OPTIONS, getOrderStatusLabel, getOrderStatusColor } from '@/constants/order-status';

const toast = useToast();
const authStore = useAuthStore();

const orders = ref<any[]>([]);
const loading = ref(false);
const designers = ref<any[]>([]);
const filterDesigner = ref<string | null>(null);
const filterStatus = ref<string | null>(null);
const fromDate = ref('');
const toDate = ref('');

const showEditModal = ref(false);
const selectedOrder = ref<any>(null);

const statusOptions = ORDER_STATUS_OPTIONS;

const isAdminOrManager = computed(() => {
  const user = authStore.user;
  return user?.role === 'owner' || user?.role === 'admin' || authStore.canAccess('orders', 'edit');
});

onMounted(() => {
  fetchOrders();
  if (isAdminOrManager.value) loadDesigners();
});

async function fetchOrders() {
  loading.value = true;
  try {
    const params: any = {
      limit: 500,
      offset: 0,
      status: filterStatus.value || undefined,
      designerId: filterDesigner.value || undefined,
    };
    const res = await api.get<{ orders: any[]; total: number }>('/orders', { params });
    orders.value = res.data.orders || [];
  } catch (err) {
    console.error('Cannot load orders:', err);
    toast.error('Lỗi khi tải danh sách đơn hàng');
  } finally {
    loading.value = false;
  }
}

async function loadDesigners() {
  try {
    const res = await api.get<{ users?: Array<{ id: string; fullName: string }> }>('/users');
    designers.value = res.data.users || [];
  } catch (err) {
    console.error('Cannot load designers:', err);
  }
}

const groupedOrders = computed(() => {
  const from = fromDate.value ? new Date(fromDate.value + 'T00:00:00') : null;
  const to = toDate.value ? new Date(toDate.value + 'T23:59:59') : null;

  const filtered = orders.value.filter(o => {
    const created = new Date(o.createdAt);
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });

  const map = new Map<string, any[]>();
  for (const o of filtered) {
    const d = new Date(o.createdAt);
    const key = d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }

  return Array.from(map.entries())
    .map(([dateLabel, list]) => ({
      date: dateLabel,
      dateLabel,
      orders: list,
      sortKey: new Date(list[0].createdAt).getTime(),
    }))
    .sort((a, b) => b.sortKey - a.sortKey);
});

function editOrder(order: any) {
  selectedOrder.value = order;
  showEditModal.value = true;
}

function getStatusLabel(s: string) {
  return getOrderStatusLabel(s);
}
function getStatusColor(s: string) {
  return getOrderStatusColor(s);
}
</script>

<style scoped>
.order-card {
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(47, 128, 237, 0.25) !important;
}
.urgent-card {
  background-color: #EBF3FF !important;
}
</style>
