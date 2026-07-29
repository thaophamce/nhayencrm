<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="tag-crm-bar">
    <span class="bar-label"><TagIcon :size="14" :stroke-width="2" /> Trạng thái đơn:</span>

    <template v-if="ORDER_STATUS_OPTIONS">
      <button
        v-for="opt in ORDER_STATUS_OPTIONS"
        :key="opt.value"
        class="t2-tag-pill inline-quick-tag"
        :class="{ active: order?.status === opt.value }"
        :style="{ '--tag-color': getStatusColor(opt.value) }"
        :disabled="!canEdit || updating"
        @click="onPickStatus(opt.value)"
      >
        <span class="t2-pill-text">{{ opt.label }}</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '@/api/index';
import { Tag as TagIcon } from 'lucide-vue-next';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';
import { ORDER_STATUS_OPTIONS } from '@/constants/order-status';

function getStatusColor(value: string) {
  switch (value) {
    case 'demo': return '#FF9800';      // cam
    case 'designing': return '#0068FF'; // blue
    case 'approved': return '#4CAF50';  // xanh lá
    case 'cancelled': return '#F44336'; // đỏ
    default: return '#546E7A';
  }
}

const props = defineProps<{
  friendId: string | null;
  /** contactId — legacy kept cho backward compat, không dùng trong refactor mới */
  contactId?: string | null;
  conversationId?: string | null;
  /** Tên hiển thị hội thoại (nhóm hoặc bạn) — dùng làm gốc mã đơn khi auto-tạo */
  defaultName?: string | null;
}>();

const toast = useToast();
const authStore = useAuthStore();

const isAdminOrManager = computed(() => {
  const user = authStore.user;
  return user?.role === 'owner' || user?.role === 'admin' || authStore.canAccess('user');
});
const canEdit = isAdminOrManager;

const order = ref<any>(null);
const orderLoading = ref(false);
const updating = ref(false);

async function loadOrder() {
  const convId = props.conversationId || props.friendId;
  if (!convId) return;
  orderLoading.value = true;
  try {
    const res = await api.get(`/orders/by-conversation/${convId}`);
    order.value = res.data.order;
  } catch (err) {
    console.error('[TagCrmBar] loadOrder error:', err);
    order.value = null;
  } finally {
    orderLoading.value = false;
  }
}

watch(() => props.conversationId, loadOrder);
watch(() => props.friendId, loadOrder);

async function onPickStatus(status: string) {
  if (!canEdit.value || updating.value) return;
  const convId = props.conversationId || props.friendId;
  if (!convId) return;

  updating.value = true;
  try {
    if (!order.value) {
      let name = props.defaultName?.trim() || `Đơn Zalo`;
      if (props.friendId) {
        try {
          const friendRes = await api.get(`/friends/${props.friendId}`);
          if (friendRes.data?.friend?.rawProfile?.displayName) {
            name = friendRes.data.friend.rawProfile.displayName;
          }
        } catch (e) {
          console.warn('[TagCrmBar] failed to get friend display name:', e);
        }
      }

      // Mã đơn auto-tạo là nhãn hiển thị, KHÔNG phải mã nghiệp vụ duy nhất người dùng tự đặt.
      // Nhiều nhóm/khách có thể trùng tên (hoặc cùng rơi về "Đơn Zalo") → backend chặn trùng
      // orderCode theo org sẽ báo lỗi. Gắn hậu tố ngắn theo hội thoại để không bao giờ đụng nhau.
      const suffix = String(convId).slice(-4);
      const orderCode = `${name} #${suffix}`;

      const res = await api.post('/orders', {
        orderCode,
        status,
        conversationId: convId,
      });
      order.value = res.data;
      toast.success('Đã tạo đơn hàng mới');
    } else {
      if (order.value.status === status) {
        updating.value = false;
        return;
      }
      const res = await api.put(`/orders/${order.value.id}`, { status });
      order.value = res.data;
      toast.success('Đã đổi trạng thái đơn');
    }
    // Phát sự kiện để cập nhật các thành phần khác (Ví dụ: OrderTabPanel)
    window.dispatchEvent(new CustomEvent('order-updated', { detail: { conversationId: convId } }));
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Thao tác thất bại');
  } finally {
    updating.value = false;
  }
}

function handleOrderUpdatedEvent(e: Event) {
  const detail = (e as CustomEvent).detail;
  const convId = props.conversationId || props.friendId;
  if (detail && detail.conversationId === convId) {
    loadOrder();
  }
}

onMounted(() => {
  loadOrder();
  window.addEventListener('order-updated', handleOrderUpdatedEvent);
});

onUnmounted(() => {
  window.removeEventListener('order-updated', handleOrderUpdatedEvent);
});
</script>

<style scoped>
.tag-crm-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 8px;
  font-size: 12px;
  min-height: 32px;
}
.bar-label { font-size: 13px; color: #666; font-weight: bold; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px; }

.t2-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid var(--tag-color, #546E7A);
  background: var(--tag-color, #546E7A) !important;
  color: #ffffff !important;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s ease;
  opacity: 0.45;
}
.t2-tag-pill.active {
  opacity: 1;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--tag-color);
}
.t2-tag-pill:hover:not(:disabled) {
  opacity: 0.85;
}
.t2-pill-text { white-space: nowrap; }

.bar-label { display: inline-flex; align-items: center; justify-content: center; }
.bar-label svg { display: block; }
</style>
