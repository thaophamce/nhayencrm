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
            {{ stagedGroups.length }}/100
          </v-chip>
        </v-tab>
        <v-tab value="pacing">Cấu hình giãn cách (Pacing)</v-tab>
      </v-tabs>

      <div class="flex-1-1 overflow-auto px-4 pb-4">
        <!-- ════════ TAB 1: Danh sách nhóm ════════ -->
        <v-card v-if="tab === 'groups'" variant="outlined" class="ny-card mt-3">
          <div class="leave-toolbar pa-3 border-b">
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
              v-model="selectedStatuses"
              :items="statusItems"
              item-title="title"
              item-value="value"
              label="Trạng thái trong tên"
              variant="outlined"
              density="compact"
              hide-details
              multiple
              chips
              style="max-width: 300px"
              class="ny-input"
            >
              <template #prepend-inner>
                <v-icon size="18">mdi-filter-variant</v-icon>
              </template>
              <template #selection="{ index }">
                <span v-if="index === 0" class="leave-toolbar__selection-count">{{ selectedStatuses.length }} trạng thái đã chọn</span>
              </template>
              <template #item="{ props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template #prepend>
                    <v-icon size="18">mdi-tag-outline</v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-select>
            <v-combobox v-model="customKeywords" label="Từ khóa khác" multiple chips clearable variant="outlined" density="compact" hide-details style="max-width: 240px" />
            <v-text-field v-model="beforeDate" type="date" label="Nhóm trước ngày" variant="outlined" density="compact" hide-details style="max-width: 185px" />
            <v-text-field v-model.number="inactiveDays" type="number" min="1" max="3650" label="Im lặng trên (ngày)" variant="outlined" density="compact" hide-details style="max-width: 180px" />
            <v-select v-model="sortChoice" :items="sortItems" item-title="title" item-value="value" label="Sắp xếp" variant="outlined" density="compact" hide-details style="max-width: 220px" />
            <v-btn variant="flat" color="primary" prepend-icon="mdi-filter" @click="loadGroups">Lọc</v-btn>
            <v-btn variant="outlined" :disabled="!filteredGroups.length" @click="selectAll">Chọn tất cả kết quả ({{ filteredGroups.length }})</v-btn>
            <v-btn variant="outlined" :disabled="!selectedRows.length" @click="selectedRows = []">Bỏ chọn tất cả</v-btn>
            <div class="leave-toolbar__summary" role="status">
              <strong>{{ groups.length }}</strong> nhóm phù hợp ·
              <strong>{{ selectedRows.length }}</strong> đã chọn · Tối đa 100 nhóm/lượt
            </div>
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
            :items="groups"
            :loading="loadingGroups"
            item-value="id"
            show-select
            density="comfortable"
            height="460"
            fixed-header
            class="ny-table"
          >
            <template #item.matchedKeywords="{ item }">
              <div class="d-flex flex-wrap gap-1">
                <v-chip v-for="t in item.matchedKeywords" :key="t" size="x-small" color="primary" variant="tonal">
                  {{ t }}
                </v-chip>
              </div>
            </template>
            <template #item.parsedCode.date="{ item }">{{ formatDate(item.parsedCode.date) }}</template>
            <template #item.lastMessageAt="{ item }">{{ formatDateTime(item.lastMessageAt) }}</template>
            <template #item.inactiveDays="{ item }">{{ item.inactiveDays }} ngày</template>
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
              @click="clearStagedGroups"
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
const selectedStatuses = ref<string[]>(['designing', 'approved', 'shipping']);
const customKeywords = ref<string[]>([]);
const beforeDate = ref(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()));
const inactiveDays = ref(60);
const sortChoice = ref('groupDate:asc');
const statusItems = [
  { title: 'Đang thiết kế / Đang TK', value: 'designing' },
  { title: 'Chốt in', value: 'approved' },
  { title: 'Đang giao', value: 'shipping' },
];
const sortItems = [
  { title: 'Ngày nhóm: cũ nhất trước', value: 'groupDate:asc' },
  { title: 'Ngày nhóm: mới nhất trước', value: 'groupDate:desc' },
  { title: 'Tương tác cuối: cũ nhất trước', value: 'lastMessageAt:asc' },
  { title: 'Tương tác cuối: mới nhất trước', value: 'lastMessageAt:desc' },
  { title: 'Tên nhóm: A → Z', value: 'name:asc' },
  { title: 'Tên nhóm: Z → A', value: 'name:desc' },
];
const selectedRows = ref<string[]>([]);
interface LeaveCandidate { id: string; name: string; totalMember: number; parsedCode: { date: string; sequence: number }; matchedKeywords: string[]; lastMessageAt: string; inactiveDays: number; tags?: string[]; crmTagsPerNick?: string[] }
const groups = ref<LeaveCandidate[]>([]);
const candidateSummary = ref<any>(null);
const loadingGroups = ref(false);
let loadController: AbortController | null = null;

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
  groupDate?: string;
  matchedKeywords?: string[];
  lastMessageAt?: string;
  inactiveDays?: number;
}
const stagedGroups = ref<StagedGroup[]>([]);
const queueFilterSnapshot = ref<Record<string, unknown> | null>(null);

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

groupHeaders.splice(1, 1,
  { title: 'Ngày nhóm', key: 'parsedCode.date', sortable: false },
  { title: 'Từ khóa khớp', key: 'matchedKeywords', sortable: false },
  { title: 'Tương tác cuối', key: 'lastMessageAt', sortable: false },
  { title: 'Đã im', key: 'inactiveDays', sortable: false },
);

/* ── Phân loại (Zalo native labels) ── */
const MIRROR_PREFIX = '🔵 ';
const zaloLabels = ref<Array<{ id: string; text: string; color: string }>>([]);

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
  } catch (err: any) {
    console.error('syncGroupsAndLabels failed:', err);
    notify(err?.response?.data?.error || 'Đồng bộ thất bại', 'error');
  } finally {
    loadingGroups.value = false;
  }
}

async function loadGroups() {
  const acct = selectedAccountId.value;
  if (!acct) return;
  if (!selectedStatuses.value.length && !customKeywords.value.length) {
    notify('Chọn ít nhất một trạng thái hoặc nhập từ khóa', 'warning');
    return;
  }
  loadController?.abort();
  loadController = new AbortController();
  loadingGroups.value = true;
  try {
    const [sortBy, sortOrder] = sortChoice.value.split(':');
    const params = new URLSearchParams({ beforeDate: beforeDate.value, inactiveDays: String(inactiveDays.value), search: groupSearch.value, sortBy, sortOrder });
    selectedStatuses.value.forEach(value => params.append('statuses', value));
    customKeywords.value.filter(Boolean).forEach(value => params.append('customKeywords', value));
    const { data } = await api.get(`/zalo-accounts/${acct}/groups/leave-candidates?${params}`, { signal: loadController.signal });
    groups.value = data?.groups ?? [];
    candidateSummary.value = data?.summary ?? null;
    selectedRows.value = [];
    if (data?.summary?.membershipVerified === false) notify('Tài khoản đang mất kết nối — đang dùng danh sách nhóm đã xác minh gần nhất.', 'warning');
  } catch (err: any) {
    if ((err as any)?.code === 'ERR_CANCELED') return;
    console.error('loadGroups failed:', err);
    notify(err?.response?.data?.error || 'Không tải được danh sách nhóm Zalo', 'error');
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
  queueFilterSnapshot.value = null;
  processState.value = 'idle';
  if (id) {
    await loadZaloLabels(id);
    await loadGroups();
  }
}

function stageSelected() {
  const chosen = groups.value.filter(g => selectedRows.value.includes(g.id));
  const existing = new Set(stagedGroups.value.map(s => s.groupId));
  const snapshot = currentFilterSnapshot();
  if (queueFilterSnapshot.value && JSON.stringify(queueFilterSnapshot.value) !== JSON.stringify(snapshot)) {
    notify('Danh sách chờ đang dùng bộ lọc khác. Hãy xóa danh sách chờ trước.', 'warning');
    return;
  }
  if (stagedGroups.value.length + chosen.filter(g => !existing.has(g.id)).length > 100) {
    notify('Mỗi lượt xử lý tối đa 100 nhóm', 'warning');
    return;
  }
  queueFilterSnapshot.value ||= snapshot;

  for (const g of chosen) {
    if (!existing.has(g.id)) {
      stagedGroups.value.push({
        groupId: g.id,
        name: g.name || g.id,
        status: 'pending',
        groupDate: g.parsedCode.date,
        matchedKeywords: g.matchedKeywords,
        lastMessageAt: g.lastMessageAt,
        inactiveDays: g.inactiveDays,
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
    const errorMessage = err?.response?.data?.error || 'Lỗi API';
    if (errorMessage.includes('[zalo:166]')) {
      // Backend has marked this stale conversation deleted. It is no longer a
      // group belonging to the account, so do not retain it in the web queue.
      stagedGroups.value = stagedGroups.value.filter(item => item.groupId !== nextItem.groupId);
    } else {
      nextItem.status = 'failed';
      nextItem.note = errorMessage;
    }
  }

  batchCounter++;

  processTimer = setTimeout(() => {
    runNext();
  }, pacing.delaySeconds * 1000);
}

function currentFilterSnapshot() {
  return { beforeDate: beforeDate.value, inactiveDays: inactiveDays.value, statuses: [...selectedStatuses.value], customKeywords: [...customKeywords.value], search: groupSearch.value };
}

function clearStagedGroups() {
  stagedGroups.value = [];
  queueFilterSnapshot.value = null;
}
function formatDate(value: string) { return value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok' }).format(new Date(`${value}T00:00:00+07:00`)) : '—'; }
function formatDateTime(value: string) { return value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'; }

async function startLeaveProcess() {
  if (stagedGroups.value.length === 0) return;
  const acct = selectedAccountId.value;
  if (!acct || !queueFilterSnapshot.value) return;
  try {
    const { data } = await api.post(`/zalo-accounts/${acct}/groups/leave-candidates/revalidate`, { groupIds: stagedGroups.value.map(g => g.groupId), ...queueFilterSnapshot.value });
    if (!data?.valid) {
      for (const result of data?.results ?? []) {
        if (!result.valid) {
          const item = stagedGroups.value.find(g => g.groupId === result.id);
          if (item) { item.status = 'failed'; item.note = `Không còn đủ điều kiện: ${(result.exclusionReasons ?? []).join(', ')}`; }
        }
      }
      notify('Một số nhóm không còn đủ điều kiện. Chưa rời nhóm nào.', 'warning');
      return;
    }
  } catch (err: any) {
    notify(err?.response?.data?.error || 'Không thể kiểm tra lại. Chưa rời nhóm nào.', 'error');
    return;
  }
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
  loadController?.abort();
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
.leave-toolbar {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 12px;
  align-items: center;
  background: rgb(var(--v-theme-surface));
}
.leave-toolbar > :nth-child(1) { grid-column: 1 / 4; grid-row: 1; }
.leave-toolbar > :nth-child(2) { grid-column: 4 / 7; grid-row: 1; }
.leave-toolbar > :nth-child(3) { grid-column: 7 / 10; grid-row: 1; }
.leave-toolbar > :nth-child(11) { grid-column: 11 / 13; grid-row: 1; justify-self: end; }
.leave-toolbar > :nth-child(4) { grid-column: 1 / 3; grid-row: 2; }
.leave-toolbar > :nth-child(5) { grid-column: 3 / 5; grid-row: 2; }
.leave-toolbar > :nth-child(6) { grid-column: 5 / 8; grid-row: 2; }
.leave-toolbar > :nth-child(7) { grid-column: 8 / 9; grid-row: 2; }
.leave-toolbar > :nth-child(10) { grid-column: 1 / 7; grid-row: 3; }
.leave-toolbar > :nth-child(8) { grid-column: 7 / 9; grid-row: 3; }
.leave-toolbar > :nth-child(9) { grid-column: 9 / 11; grid-row: 3; }
.leave-toolbar > :nth-child(12) { grid-column: 11 / 13; grid-row: 3; justify-self: end; }
.leave-toolbar > * { max-width: none !important; min-width: 0; }
.leave-toolbar :deep(.v-field) { min-height: 40px; }
.leave-toolbar :deep(.v-field__input) { min-height: 40px; flex-wrap: nowrap; overflow: hidden; }
.leave-toolbar__selection-count { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.leave-toolbar__summary { color: rgb(var(--v-theme-on-surface-variant)); font-size: 13px; }
.leave-toolbar__summary strong { color: rgb(var(--v-theme-on-surface)); font-weight: 600; }

@media (max-width: 1200px) {
  .leave-toolbar { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .leave-toolbar > :nth-child(1) { grid-column: 1 / 4; grid-row: 1; }
  .leave-toolbar > :nth-child(2) { grid-column: 4 / 7; grid-row: 1; }
  .leave-toolbar > :nth-child(3) { grid-column: 1 / 4; grid-row: 2; }
  .leave-toolbar > :nth-child(11) { grid-column: 4 / 7; grid-row: 2; }
  .leave-toolbar > :nth-child(4) { grid-column: 1 / 3; grid-row: 3; }
  .leave-toolbar > :nth-child(5) { grid-column: 3 / 5; grid-row: 3; }
  .leave-toolbar > :nth-child(6) { grid-column: 5 / 7; grid-row: 3; }
  .leave-toolbar > :nth-child(7) { grid-column: 1 / 2; grid-row: 4; }
  .leave-toolbar > :nth-child(10) { grid-column: 2 / 7; grid-row: 4; }
  .leave-toolbar > :nth-child(8) { grid-column: 1 / 3; grid-row: 5; }
  .leave-toolbar > :nth-child(9) { grid-column: 3 / 5; grid-row: 5; }
  .leave-toolbar > :nth-child(12) { grid-column: 5 / 7; grid-row: 5; }
}

@media (max-width: 700px) {
  .leave-toolbar { display: flex; flex-direction: column; align-items: stretch; }
  .leave-toolbar > * { width: 100%; justify-content: center; }
  .leave-toolbar__summary { order: 10; padding-block: 4px; text-align: center; }
}
</style>
