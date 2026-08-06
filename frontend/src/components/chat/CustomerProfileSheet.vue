<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-bottom-sheet
    v-model="isOpen"
    scrollable
    max-width="480px"
    content-class="cl-profile-sheet"
  >
    <v-card class="cl-sheet-card">
      <!-- Drag handle -->
      <div class="cl-drag-handle"></div>

      <!-- Header -->
      <div class="pa-4 d-flex flex-column align-center text-center cl-header-border">
        <v-avatar size="64" class="mb-2">
          <v-img v-if="contact?.avatar" :src="contact.avatar" alt="Avatar" />
          <v-icon v-else size="48" color="grey-darken-1">mdi-account-circle</v-icon>
        </v-avatar>
        <div class="text-h6 font-weight-bold text-slate-900">{{ contact?.fullName || 'Khách hàng' }}</div>
        <div class="text-caption text-slate-500 mb-2">{{ contact?.phone || 'Chưa cập nhật SĐT' }}</div>

        <!-- Tags -->
        <div class="d-flex flex-wrap gap-1 justify-center mb-3">
          <v-chip
            v-for="tag in cockpit?.tags || []"
            :key="tag"
            size="x-small"
            class="text-caption px-2 font-weight-medium"
            color="primary"
            variant="tonal"
          >
            {{ tag }}
          </v-chip>
          <v-chip
            v-if="cockpit?.statusRef"
            size="x-small"
            class="text-caption px-2 font-weight-medium"
            :style="{ background: cockpit.statusRef.color ? cockpit.statusRef.color + '20' : undefined, color: cockpit.statusRef.color || undefined }"
            variant="flat"
          >
            {{ cockpit.statusRef.name }}
          </v-chip>
        </div>

        <!-- Quick actions -->
        <div class="d-flex justify-center gap-3 w-100 px-4 mt-2">
          <v-btn
            v-if="contact?.phone"
            :href="'tel:' + contact.phone"
            variant="tonal"
            color="primary"
            rounded="xl"
            class="flex-1 font-weight-semibold"
            prepend-icon="mdi-phone"
            size="small"
          >
            Gọi điện
          </v-btn>
          <v-btn
            variant="tonal"
            color="success"
            rounded="xl"
            class="flex-1 font-weight-semibold"
            prepend-icon="mdi-chat"
            size="small"
            @click="isOpen = false"
          >
            Nhắn tin
          </v-btn>
          <v-btn
            variant="tonal"
            color="grey-darken-1"
            rounded="xl"
            class="flex-1 font-weight-semibold"
            prepend-icon="mdi-note-text-outline"
            size="small"
            @click="activePanel = 'notes'"
          >
            Ghi chú
          </v-btn>
        </div>
      </div>

      <!-- Content -->
      <v-card-text class="pa-0 overflow-y-auto" style="max-height: 60vh;">
        <v-expansion-panels v-model="activePanel" variant="accordion" class="cl-panels">

          <!-- Customer Info -->
          <v-expansion-panel value="info">
            <v-expansion-panel-title class="font-weight-semibold text-slate-800">
              Thông tin khách hàng
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="cl-info-list">
                <div class="cl-info-item">
                  <span class="cl-info-label">Nguồn khách hàng:</span>
                  <span class="cl-info-value">{{ cockpit?.source || 'Không xác định' }}</span>
                </div>
                <div class="cl-info-item" v-if="cockpit?.firstContactDate">
                  <span class="cl-info-label">Ngày liên hệ đầu:</span>
                  <span class="cl-info-value">{{ formatDate(cockpit.firstContactDate) }}</span>
                </div>
                <div class="cl-info-item">
                  <span class="cl-info-label">Người phụ trách:</span>
                  <span class="cl-info-value">{{ cockpit?.assignedUser?.fullName || 'Chưa phân công' }}</span>
                </div>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- Order -->
          <v-expansion-panel value="order">
            <v-expansion-panel-title class="font-weight-semibold text-slate-800">
              Đơn hàng
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div v-if="loadingOrder" class="text-center py-4 text-slate-400">Đang tải đơn hàng...</div>
              <div v-else-if="order" class="cl-order-detail-box">
                <div class="cl-info-item">
                  <span class="cl-info-label">Mã đơn:</span>
                  <span class="cl-info-value font-weight-bold text-primary">{{ order.orderCode }}</span>
                </div>
                <div class="cl-info-item">
                  <span class="cl-info-label">Designer:</span>
                  <span class="cl-info-value">{{ order.designer?.fullName || 'Chưa gán' }}</span>
                </div>
                <div class="cl-info-item">
                  <span class="cl-info-label">Trạng thái:</span>
                  <span
                    class="cl-status-pill"
                    :class="order.status"
                  >{{ getStatusText(order.status) }}</span>
                </div>
                <div class="cl-info-item" v-if="order.deadline">
                  <span class="cl-info-label">Hạn chót:</span>
                  <span class="cl-info-value">{{ formatDate(order.deadline) }}</span>
                </div>
                <div class="cl-info-item">
                  <span class="cl-info-label">Số mẫu thiết kế:</span>
                  <span class="cl-info-value font-weight-medium">{{ order.fileCount }} Files</span>
                </div>
              </div>
              <div v-else class="text-center py-4 text-slate-400">
                Chưa có đơn hàng nào cho hội thoại này.
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- AI Summary -->
          <v-expansion-panel value="ai">
            <v-expansion-panel-title class="font-weight-semibold text-slate-800">
              AI Tóm tắt khách hàng
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div v-if="loadingCockpit" class="text-center py-4 text-slate-400">Đang tóm tắt...</div>
              <div v-else-if="cockpit?.notes" class="text-body-2 text-slate-600 pa-2 bg-slate-50 rounded-lg border">
                {{ cockpit.notes }}
              </div>
              <div v-else class="text-center py-4 text-slate-400">Chưa có tóm tắt AI.</div>
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- Internal Notes -->
          <v-expansion-panel value="notes">
            <v-expansion-panel-title class="font-weight-semibold text-slate-800">
              Ghi chú nội bộ
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-textarea
                v-model="notesInput"
                placeholder="Nhập ghi chú nội bộ của nhân viên tại đây..."
                variant="outlined"
                density="comfortable"
                rows="3"
                hide-details
                class="mb-3"
              />
              <v-btn
                color="primary"
                size="small"
                rounded="lg"
                class="font-weight-semibold"
                :loading="savingNotes"
                @click="saveInternalNotes"
              >
                Lưu ghi chú
              </v-btn>
            </v-expansion-panel-text>
          </v-expansion-panel>

        </v-expansion-panels>
      </v-card-text>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api';
import { useContactCockpit } from '@/composables/use-contact-cockpit';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{
  modelValue: boolean;
  contact: any;
  conversationId: string | null;
}>();

const emit = defineEmits(['update:modelValue']);

const toast = useToast();
const { cockpit, fetchCockpit, loading: loadingCockpit } = useContactCockpit();

const isOpen = ref(false);
const activePanel = ref<string | null>('info');
const order = ref<any>(null);
const loadingOrder = ref(false);
const notesInput = ref('');
const savingNotes = ref(false);

watch(() => props.modelValue, (val) => {
  isOpen.value = val;
  if (val && props.contact?.id) {
    fetchCockpit(props.contact.id);
    notesInput.value = props.contact.notes || '';
    if (props.conversationId) {
      loadOrderForConversation(props.conversationId);
    }
  }
});

watch(isOpen, (val) => {
  emit('update:modelValue', val);
});

async function loadOrderForConversation(convId: string) {
  loadingOrder.value = true;
  try {
    const { data } = await api.get(`/orders/by-conversation/${convId}`);
    order.value = data.order || null;
  } catch (err) {
    order.value = null;
  } finally {
    loadingOrder.value = false;
  }
}

async function saveInternalNotes() {
  if (!props.contact?.id) return;
  savingNotes.value = true;
  try {
    await api.put(`/contacts/${props.contact.id}`, { notes: notesInput.value });
    props.contact.notes = notesInput.value;
    toast.success('Lưu ghi chú thành công');
  } catch (err) {
    toast.error('Lưu ghi chú thất bại');
  } finally {
    savingNotes.value = false;
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
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
</script>

<style scoped>
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
.theme--dark .cl-header-border {
  border-bottom: 1px solid #1E293B;
}
.cl-info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 4px;
}
.cl-info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}
.cl-info-label {
  color: #64748B;
  font-weight: 500;
}
.cl-info-value {
  color: #0F172A;
  font-weight: 600;
}
.theme--dark .cl-info-value {
  color: #F8FAFC;
}
.cl-order-detail-box {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #E2E8F0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.theme--dark .cl-order-detail-box {
  background: #1E293B;
  border-color: #334155;
}
.cl-status-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 10px;
  color: #FFFFFF;
}
.cl-status-pill.demo { background: #FFB74D; }
.cl-status-pill.designing { background: #64B5F6; }
.cl-status-pill.approved { background: #81C784; }
.cl-status-pill.cancelled { background: #E57373; }
</style>
