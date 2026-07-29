<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  ZaloBulkAssignDialog — Task C 2026-07-14 (anh chốt): admin chọn 1 nhân viên → thấy
  toàn bộ nick của org → tick chọn quyền (Xem/Chat/Quản lý) cho từng nick, lưu 1 lần.
  Dùng lại API grant/update/revoke sẵn có ở /zalo-accounts/:id/access (loop theo nick đổi).
-->
<template>
  <v-dialog v-model="open" max-width="640">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="#0E445A">mdi-account-multiple-check</v-icon>
        Cấp quyền nick Zalo — {{ userName }}
      </v-card-title>

      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate color="#1786BE" class="mb-3" />

        <div v-if="!loading && accounts.length === 0" class="text-medium-emphasis text-body-2">
          Org chưa có nick Zalo nào.
        </div>

        <v-list v-else density="compact" rounded="lg" class="zba-vlist">
          <v-list-item v-for="a in accounts" :key="a.id" class="zba-vrow">
            <template #prepend>
              <Avatar :name="a.displayName || '?'" :src="a.avatarUrl" :size="34" :platform="null" class="mr-3" />
            </template>
            <v-list-item-title class="zba-name">{{ a.displayName || '(chưa đặt tên)' }}</v-list-item-title>
            <v-list-item-subtitle class="zba-sub">
              {{ a.phone || '—' }}
              <span v-if="a.isOwner" class="zba-owner-tag">Chủ nick</span>
              <span v-else-if="a.ownerName" class="zba-owner-note">Chủ: {{ a.ownerName }}</span>
            </v-list-item-subtitle>
            <template #append>
              <v-select
                :model-value="draft[a.id]"
                :items="permissionOptions"
                item-title="label"
                item-value="value"
                density="compact"
                hide-details
                variant="outlined"
                :disabled="a.isOwner"
                style="min-width: 140px;"
                @update:model-value="(v: any) => (draft[a.id] = v)"
              />
            </template>
          </v-list-item>
        </v-list>

        <v-alert v-if="dialogError" type="error" density="compact" class="mt-3">{{ dialogError }}</v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Đóng</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="loading" @click="handleSave">Lưu</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';

import { api } from '@/api/index';
import Avatar from '@/components/ui/Avatar.vue';

interface AccessAccount {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  status: string;
  isOwner: boolean;
  ownerName: string | null;
  accessId: string | null;
  permission: string | null; // 'read' | 'chat' | 'admin' | null
}

const props = defineProps<{
  modelValue: boolean;
  userId: string;
  userName: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'saved'): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const accounts = ref<AccessAccount[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogError = ref('');
// draft[accountId] = 'none' | 'read' | 'chat' | 'admin' — state hiện tại trong dialog (chưa lưu)
const draft = reactive<Record<string, string>>({});

const permissionOptions = [
  { label: 'Không có quyền', value: 'none' },
  { label: 'Xem', value: 'read' },
  { label: 'Chat', value: 'chat' },
  { label: 'Quản lý', value: 'admin' },
];

async function fetchAccess() {
  if (!props.userId) return;
  loading.value = true;
  dialogError.value = '';
  try {
    const res = await api.get(`/users/${props.userId}/zalo-access`);
    accounts.value = res.data.accounts ?? [];
    for (const a of accounts.value) {
      draft[a.id] = a.isOwner ? 'admin' : (a.permission ?? 'none');
    }
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi tải danh sách nick';
    accounts.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  saving.value = true;
  dialogError.value = '';
  try {
    for (const a of accounts.value) {
      if (a.isOwner) continue; // chủ nick luôn có full quyền, không đổi qua đây
      const before = a.permission ?? 'none';
      const after = draft[a.id] ?? 'none';
      if (before === after) continue;

      if (after === 'none') {
        if (a.accessId) await api.delete(`/zalo-accounts/${a.id}/access/${a.accessId}`);
      } else if (before === 'none') {
        await api.post(`/zalo-accounts/${a.id}/access`, { userId: props.userId, permission: after });
      } else if (a.accessId) {
        await api.put(`/zalo-accounts/${a.id}/access/${a.accessId}`, { permission: after });
      }
    }
    emit('saved');
    open.value = false;
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi lưu quyền truy cập';
  } finally {
    saving.value = false;
  }
}

watch(() => props.modelValue, (val) => {
  if (val) fetchAccess();
});
</script>

<style scoped>
.zba-vlist {
  background: #F7F9FC;
  border: 1px solid #E7EAF0;
  padding: 4px;
  max-height: 420px;
  overflow-y: auto;
}
.zba-vrow:not(:last-child) {
  border-bottom: 1px solid #EEF1F6;
}
.zba-name {
  font-weight: 600;
  color: #141A24;
}
.zba-sub {
  font-size: 12px;
  color: #6B7488;
}
.zba-owner-tag {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  background: #FEF3C7;
  color: #92400E;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}
.zba-owner-note {
  margin-left: 6px;
  color: #9297a0;
}
</style>
