<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  GroupLeaveBlastView — "Rời nhóm hàng loạt".
  Cho phép chọn nhiều nhóm và rời nhóm trong im lặng lần lượt với cơ chế Pacing an toàn chống spam/khoá nick.
-->
<template>
  <div class="d-flex flex-column h-100 ny-theme">
    <div class="d-flex align-center pa-4 pb-2 gap-3 ny-header-bar">
      <div>
        <div class="text-caption ny-subtitle">Marketing / Rời nhóm hàng loạt</div>
        <h1 class="text-h5 ny-title font-weight-bold">Rời nhóm hàng loạt (Trong im lặng)</h1>
      </div>
      <v-spacer />
      <v-select
        v-model="selectedAccountId"
        :items="accounts"
        item-title="displayName"
        item-value="id"
        label="Tài khoản Zalo"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 240px"
        :loading="accountLoading"
        @update:model-value="onAccountChange"
      >
        <template #item="{ props: itemProps, item }">
          <v-list-item v-bind="itemProps">
            <template #append>
              <v-chip size="x-small" :color="acctOnline(item) ? 'success' : 'error'" variant="tonal">
                {{ acctOnline(item) ? 'Online' : 'Offline' }}
              </v-chip>
            </template>
          </v-list-item>
        </template>
      </v-select>
    </div>

    <v-alert v-if="!selectedAccountId" type="info" variant="tonal" class="mx-4" icon="mdi-information">
      Chọn một tài khoản Zalo để bắt đầu.
    </v-alert>

    <template v-else>
      <v-tabs v-model="tab" color="primary" class="px-4 flex-0-0">
        <v-tab value="groups">Danh sách nhóm</v-tab>
        <v-tab value="process">
          Danh sách chờ rời
          <v-chip v-if="stagedGroups.length" size="x-small" color="primary" class="ml-2">
            {{ stagedGroups.length }}
          </v-chip>
        </v-tab>
        <v-tab value="pacing">Cấu hình giãn cách (Pacing)</v-tab>
      </v-tabs>

      <div class="flex-1-1 overflow-auto px-4 pb-4">
        <!-- ════════ TAB 1: Danh sách nhóm ════════ -->
        <v-card v-if="tab === 'groups'" variant="outlined" class="ny-card mt-3">
          <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
            <v-text-field
              v-model="groupSearch"
              placeholder="Tìm tên nhóm..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 260px"
              class="ny-input"
              @keyup.enter="loadGroups"
            />
            <v-select
              v-model="groupTag"
              :items="zaloLabelItems"
              item-title="title"
              item-value="value"
              label="Phân loại"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              style="max-width: 220px"
              class="ny-input"
              @update:model-value="loadGroups"
            >
              <template #prepend-inner>
                <v-icon size="18" :color="selectedLabelColor">mdi-flag</v-icon>
              </template>
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps">
                  <template #prepend>
                    <v-icon size="18" :color="(item as any).raw?.color">mdi-flag</v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-select>
            <v-btn variant="flat" color="primary" prepend-icon="mdi-filter" @click="loadGroups">Lọc</v-btn>
            <v-btn variant="outlined" :disabled="!filteredGroups.length" @click="selectAll">Chọn tất cả</v-btn>
            <v-btn variant="outlined" :disabled="!selectedRows.length" @click="selectedRows = []">Bỏ chọn tất cả</v-btn>
            <v-spacer />
            <v-btn variant="flat" color="primary" prepend-icon="mdi-refresh" :loading="loadingGroups" @click="syncGroupsAndLabels">
              Cập nhật
            </v-btn>
            <v-btn
              color="error"
              variant="flat"
              prepend-icon="mdi-logout-variant"
              :disabled="!selectedRows.length"
              @click="stageSelected"
            >
              Đưa vào danh sách chờ rời ({{ selectedRows.length }})
            </v-btn>
          </div>

          <v-data-table
            v-model="selectedRows"
            :headers="groupHeaders"
            :items="filteredGroups"
            :loading="loadingGroups"
            item-value="id"
            show-select
            density="comfortable"
            height="460"
            fixed-header
            class="ny-table"
          >
            <template #item.tags="{ item }">
              <div class="d-flex flex-wrap gap-1">
                <v-chip v-for="t in item.crmTagsPerNick || item.tags || []" :key="t" size="x-small" color="primary" variant="tonal">
                  {{ t }}
                </v-chip>
              </div>
            </template>
            <template #item.totalMember="{ item }">
              <span>{{ item.totalMember }} thành viên</span>
            </template>
          </v-data-table>
        </v-card>

        <!-- ════════ TAB 2: Danh sách chờ rời ════════ -->
        <v-card v-if="tab === 'process'" variant="outlined" class="ny-card mt-3">
          <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
            <div class="text-subtitle-2 font-weight-bold">
              Tiến trình rời: <span :class="statusColor(processState)">{{ statusLabel(processState) }}</span>
            </div>
            <v-spacer />
            <v-btn
              v-if="processState === 'idle'"
              color="error"
              prepend-icon="mdi-play"
              :disabled="!stagedGroups.length"
              @click="startLeaveProcess"
            >
              Bắt đầu rời nhóm
            </v-btn>
            <v-btn
              v-if="processState === 'running'"
              color="warning"
              prepend-icon="mdi-pause"
              @click="pauseLeaveProcess"
            >
              Tạm dừng
            </v-btn>
            <v-btn
              v-if="processState === 'paused'"
              color="success"
              prepend-icon="mdi-play"
              @click="resumeLeaveProcess"
            >
              Tiếp tục
            </v-btn>
            <v-btn
              v-if="processState !== 'idle'"
              color="grey"
              variant="outlined"
              prepend-icon="mdi-stop"
              @click="stopLeaveProcess"
            >
              Dừng/Huỷ bỏ
            </v-btn>
            <v-btn
              variant="text"
              color="error"
              :disabled="processState === 'running'"
              prepend-icon="mdi-delete-sweep-outline"
              @click="stagedGroups = []"
            >
              Xoá danh sách
            </v-btn>
          </div>

          <v-data-table
            :headers="processHeaders"
            :items="stagedGroups"
            density="comfortable"
            height="460"
            fixed-header
            class="ny-table"
          >
            <template #item.status="{ item }">
              <v-chip size="small" :color="rowStatusColor(item.status)" variant="tonal">
                {{ rowStatusLabel(item.status) }}
              </v-chip>
            </template>
          </v-data-table>
        </v-card>

        <!-- ════════ TAB 3: Cấu hình giãn cách ════════ -->
        <v-card v-if="tab === 'pacing'" variant="outlined" class="ny-card mt-3">
          <div class="pa-4">
            <h3 class="text-subtitle-1 font-weight-bold mb-4">Quy tắc giãn cách (Pacing Rules)</h3>
            <v-alert type="warning" variant="tonal" border="start" class="mb-4" density="compact">
              Việc rời nhóm liên tục có thể đánh dấu tài khoản Zalo của bạn hoạt động như bot spam. Khuyến nghị giãn cách tối thiểu 30 giây giữa mỗi nhóm.
            </v-alert>
            <div class="d-flex flex-column gap-3" style="max-width: 480px">
              <v-text-field
                v-model.number="pacing.delaySeconds"
                type="number"
                min="10"
                label="Khoảng cách giữa mỗi lần rời nhóm (giây)"
                variant="outlined"
                density="compact"
              />
              <v-text-field
                v-model.number="pacing.batchSize"
                type="number"
                min="1"
                label="Số lượng nhóm rời mỗi đợt trước khi nghỉ dài"
                variant="outlined"
                density="compact"
              />
              <v-text-field
                v-model.number="pacing.batchPauseMinutes"
                type="number"
                min="1"
                label="Thời gian nghỉ dài giữa các đợt (phút)"
                variant="outlined"
                density="compact"
              />
              <v-text-field
                v-model.number="pacing.dailyLimit"
                type="number"
                min="1"
                label="Giới hạn tối đa rời nhóm một ngày"
                variant="outlined"
                density="compact"
              />
            </div>
          </div>
        </v-card>
      </div>
    </template>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onBeforeUnmount } from 'vue';
import { api } from '@/api/index';
import { useSelectedAccount } from '@/composables/use-selected-account';

const { accounts, selectedAccountId, selectAccount, loading: accountLoading } = useSelectedAccount();
function acctOnline(item: any): boolean {
  const a = item?.raw ?? item;
  return String(a?.liveStatus || a?.status || '').toLowerCase() === 'connected';
}

const tab = ref<'groups' | 'process' | 'pacing'>('groups');
const groupSearch = ref('');
const groupTag = ref<string | null>(null);
const selectedRows = ref<string[]>([]);
const groups = ref<Array<{ id: string; name: string; totalMember: number; tags?: string[]; crmTagsPerNick?: string[] }>>([]);
const loadingGroups = ref(false);

// Cấu hình giãn cách rời nhóm (Rời nhóm Zalo cần khoảng nghỉ lâu hơn)
const pacing = reactive({
  delaySeconds: 30,
  batchSize: 5,
  batchPauseMinutes: 10,
  dailyLimit: 10,
});

type ProcessState = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
const processState = ref<ProcessState>('idle');

interface StagedGroup {
  groupId: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  note?: string;
}
const stagedGroups = ref<StagedGroup[]>([]);

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}

const groupHeaders = [
  { title: 'Tên nhóm Zalo', key: 'name', sortable: true },
  { title: 'Thẻ tag', key: 'tags', sortable: false },
  { title: 'Thành viên', key: 'totalMember', sortable: true },
];

const processHeaders = [
  { title: 'Tên nhóm Zalo', key: 'name' },
  { title: 'Mã nhóm', key: 'groupId' },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Ghi chú', key: 'note' },
];

/* ── Phân loại (Zalo native labels) ── */
const MIRROR_PREFIX = '🔵 ';
function normalizeColor(c?: string | null): string {
  if (!c) return '#999999';
  if (c.startsWith('#')) return c.slice(0, 7);
  if (/^[0-9a-f]{6}$/i.test(c)) return '#' + c;
  return c;
}
const zaloLabels = ref<Array<{ id: string; text: string; color: string }>>([]);
const zaloLabelItems = computed(() =>
  zaloLabels.value.map((l) => ({ title: l.text, value: `${MIRROR_PREFIX}${l.text}`, color: normalizeColor(l.color) })),
);
const selectedLabelColor = computed(() => zaloLabelItems.value.find((i) => i.value === groupTag.value)?.color ?? '#999999');

async function loadZaloLabels(accountId: string) {
  try {
    const { data } = await api.get(`/zalo-accounts/${accountId}/labels`);
    zaloLabels.value = (data?.labels ?? []).map((l: any) => ({ id: l.id, text: l.text, color: l.color }));
  } catch (err) {
    console.error('loadZaloLabels failed:', err);
    zaloLabels.value = [];
  }
}

async function syncGroupsAndLabels() {
  const acct = selectedAccountId.value;
  if (!acct) return;
  loadingGroups.value = true;
  try {
    await api.post(`/zalo-accounts/${acct}/labels/sync`);
    await loadZaloLabels(acct);
    await loadGroups();
    notify('Đã cập nhật danh sách nhóm và thẻ tag');
  } catch (err) {
    console.error('syncGroupsAndLabels failed:', err);
    notify('Đồng bộ thất bại', 'error');
  } finally {
    loadingGroups.value = false;
  }
}

async function loadGroups() {
  const acct = selectedAccountId.value;
  if (!acct) return;
  loadingGroups.value = true;
  try {
    const { data } = await api.get(`/zalo-accounts/${acct}/groups`);
    groups.value = data?.groups ?? [];
  } catch (err) {
    console.error('loadGroups failed:', err);
    notify('Không tải được danh sách nhóm Zalo', 'error');
  } finally {
    loadingGroups.value = false;
  }
}

const filteredGroups = computed(() => {
  let list = groups.value;

  // Lọc theo tag
  if (groupTag.value) {
    const t = groupTag.value.replace(MIRROR_PREFIX, '').trim().toLowerCase();
    list = list.filter((g) => {
      const gtags = g.crmTagsPerNick || g.tags || [];
      return gtags.some((tag) => tag.toLowerCase() === t);
    });
  }

  const q = groupSearch.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((g) => g.name.toLowerCase().includes(q) || g.id.includes(q));
});

function selectAll() {
  selectedRows.value = filteredGroups.value.map(g => g.id);
}

async function onAccountChange(id: string) {
  selectAccount(id);
  selectedRows.value = [];
  stagedGroups.value = [];
  processState.value = 'idle';
  if (id) {
    await loadZaloLabels(id);
    await loadGroups();
  }
}

function stageSelected() {
  const chosen = groups.value.filter(g => selectedRows.value.includes(g.id));
  const existing = new Set(stagedGroups.value.map(s => s.groupId));

  for (const g of chosen) {
    if (!existing.has(g.id)) {
      stagedGroups.value.push({
        groupId: g.id,
        name: g.name || g.id,
        status: 'pending',
      });
    }
  }
  selectedRows.value = [];
  tab.value = 'process';
}

// ── Tiến trình xử lý rời nhóm (Pacing rời nhóm im lặng) ──
let processTimer: ReturnType<typeof setTimeout> | null = null;
let batchCounter = 0;

async function runNext() {
  if (processState.value !== 'running') return;

  const nextItem = stagedGroups.value.find(s => s.status === 'pending');
  if (!nextItem) {
    processState.value = 'completed';
    notify('Đã rời khỏi các nhóm thành công!');
    return;
  }

  // Check đợt nghỉ
  if (batchCounter >= pacing.batchSize) {
    batchCounter = 0;
    processState.value = 'paused';
    notify(`Đã hoàn tất rời ${pacing.batchSize} nhóm, nghỉ dài ${pacing.batchPauseMinutes} phút bảo mật.`, 'warning');
    processTimer = setTimeout(() => {
      processState.value = 'running';
      runNext();
    }, pacing.batchPauseMinutes * 60 * 1000);
    return;
  }

  nextItem.status = 'processing';

  try {
    const acct = selectedAccountId.value;
    const res = await api.post(`/zalo-accounts/${acct}/groups/${nextItem.groupId}/leave`);

    if (res.status === 200 || res.status === 204 || res.data?.success) {
      nextItem.status = 'success';
      nextItem.note = 'Đã rời nhóm (Trong im lặng)';
    } else {
      nextItem.status = 'failed';
      nextItem.note = 'Thao tác không thành công';
    }
  } catch (err: any) {
    nextItem.status = 'failed';
    nextItem.note = err?.response?.data?.error || 'Lỗi API';
  }

  batchCounter++;

  processTimer = setTimeout(() => {
    runNext();
  }, pacing.delaySeconds * 1000);
}

function startLeaveProcess() {
  if (stagedGroups.value.length === 0) return;
  processState.value = 'running';
  batchCounter = 0;
  runNext();
}

function pauseLeaveProcess() {
  processState.value = 'paused';
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }
}

function resumeLeaveProcess() {
  processState.value = 'running';
  runNext();
}

function stopLeaveProcess() {
  processState.value = 'cancelled';
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }
  stagedGroups.value.forEach(s => {
    if (s.status === 'pending' || s.status === 'processing') {
      s.status = 'pending';
    }
  });
  processState.value = 'idle';
}

function statusLabel(state: ProcessState): string {
  return { idle: 'Chưa chạy', running: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn tất', cancelled: 'Đã huỷ' }[state] ?? state;
}
function statusColor(state: ProcessState): string {
  return { idle: 'text-grey', running: 'text-info', paused: 'text-warning', completed: 'text-success', cancelled: 'text-error' }[state] ?? '';
}

function rowStatusLabel(status: string): string {
  return { pending: 'Chờ xử lý', processing: 'Đang rời...', success: 'Đã rời', failed: 'Thất bại' }[status] ?? status;
}
function rowStatusColor(status: string): string {
  return { pending: 'grey', processing: 'info', success: 'success', failed: 'error' }[status] ?? 'grey';
}

onBeforeUnmount(() => {
  if (processTimer) clearTimeout(processTimer);
});

import { watch } from 'vue';
watch(selectedAccountId, async (id, prevId) => {
  if (!id || id === prevId) return;
  stagedGroups.value = [];
  await loadZaloLabels(id);
  await loadGroups();
}, { immediate: true });
</script>

<style scoped>
.ny-theme {
  background-color: #fafafa;
}
.ny-card {
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
</style>
