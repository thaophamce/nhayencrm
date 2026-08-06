<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  FriendUnfriendBlastView — "Huỷ kết bạn hàng loạt".
  Cho phép chọn nhiều bạn bè và huỷ kết bạn lần lượt với cơ chế Pacing an toàn chống spam/khoá nick.
-->
<template>
  <div class="d-flex flex-column h-100 ny-theme">
    <div class="d-flex align-center pa-4 pb-2 gap-3 ny-header-bar">
      <div>
        <div class="text-caption ny-subtitle">Marketing / Huỷ kết bạn hàng loạt</div>
        <h1 class="text-h5 ny-title font-weight-bold">Huỷ kết bạn hàng loạt</h1>
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
        <v-tab value="friends">Danh sách bạn bè</v-tab>
        <v-tab value="process">
          Danh sách chờ huỷ
          <v-chip v-if="stagedFriends.length" size="x-small" color="primary" class="ml-2">
            {{ stagedFriends.length }}
          </v-chip>
        </v-tab>
        <v-tab value="pacing">Cấu hình giãn cách (Pacing)</v-tab>
      </v-tabs>

      <div class="flex-1-1 overflow-auto px-4 pb-4">
        <!-- ════════ TAB 1: Danh sách bạn bè ════════ -->
        <v-card v-if="tab === 'friends'" variant="outlined" class="ny-card mt-3">
          <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
            <v-text-field
              v-model="friendSearch"
              placeholder="Tìm theo tên..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 260px"
              class="ny-input"
              @keyup.enter="loadFriends"
            />
            <v-select
              v-model="friendTag"
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
              @update:model-value="loadFriends"
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
            <v-select
              v-model="friendSortBy"
              :items="[
                { title: 'Mới tương tác', value: 'recent' },
                { title: 'Tên A-Z', value: 'name' },
                { title: 'Điểm cao nhất', value: 'score-desc' },
                { title: 'Bị kẹt lâu nhất', value: 'stuck' },
              ]"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 180px"
              class="ny-input"
              @update:model-value="loadFriends"
            />
            <v-btn variant="flat" color="primary" prepend-icon="mdi-filter" @click="loadFriends">Lọc</v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-checkbox-multiple-marked-outline" :disabled="!friendsDb.length" @click="selectAll">
              Chọn tất cả
            </v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-checkbox-multiple-blank-outline" :disabled="!selectedRows.length" @click="selectedRows = []">
              Bỏ chọn tất cả
            </v-btn>
            <v-spacer />
            <v-btn variant="flat" color="primary" prepend-icon="mdi-refresh" :loading="syncing" @click="syncFriends">
              Cập nhật
            </v-btn>
            <v-btn
              color="error"
              variant="flat"
              prepend-icon="mdi-account-minus-outline"
              :disabled="!selectedRows.length"
              @click="stageSelected"
            >
              Đưa vào danh sách chờ huỷ ({{ selectedRows.length }})
            </v-btn>
          </div>

          <v-data-table
            v-model="selectedRows"
            :headers="friendHeaders"
            :items="friendsDb"
            :loading="loadingDb"
            item-value="zaloUidInNick"
            show-select
            density="comfortable"
            height="460"
            fixed-header
            class="ny-table"
          >
            <template #item.member="{ item }">
              <div class="d-flex align-center gap-2">
                <v-avatar size="32" class="bg-grey-lighten-2">
                  <v-img v-if="item.zaloAvatarUrl" :src="item.zaloAvatarUrl" />
                  <span v-else class="text-caption font-weight-bold">{{ item.zaloDisplayName?.charAt(0) || '?' }}</span>
                </v-avatar>
                <div>
                  <div class="font-weight-medium text-body-2">{{ item.zaloDisplayName || item.zaloUidInNick }}</div>
                  <div class="text-caption text-grey">{{ item.zaloUidInNick }}</div>
                </div>
              </div>
            </template>
            <template #item.tags="{ item }">
              <div class="d-flex flex-wrap gap-1">
                <v-chip v-for="t in item.crmTagsPerNick || []" :key="t" size="x-small" color="primary" variant="tonal">
                  {{ t }}
                </v-chip>
              </div>
            </template>
            <template #item.lastInteractionAt="{ item }">
              <span class="text-caption">{{ formatDateTime(item.lastInteractionAt) }}</span>
            </template>
          </v-data-table>
        </v-card>

        <!-- ════════ TAB 2: Danh sách chờ huỷ ════════ -->
        <v-card v-if="tab === 'process'" variant="outlined" class="ny-card mt-3">
          <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
            <div class="text-subtitle-2 font-weight-bold">
              Tiến trình huỷ: <span :class="statusColor(processState)">{{ statusLabel(processState) }}</span>
            </div>
            <v-spacer />
            <v-btn
              v-if="processState === 'idle'"
              color="error"
              prepend-icon="mdi-play"
              :disabled="!stagedFriends.length"
              @click="startUnfriendProcess"
            >
              Bắt đầu huỷ
            </v-btn>
            <v-btn
              v-if="processState === 'running'"
              color="warning"
              prepend-icon="mdi-pause"
              @click="pauseUnfriendProcess"
            >
              Tạm dừng
            </v-btn>
            <v-btn
              v-if="processState === 'paused'"
              color="success"
              prepend-icon="mdi-play"
              @click="resumeUnfriendProcess"
            >
              Tiếp tục
            </v-btn>
            <v-btn
              v-if="processState !== 'idle'"
              color="grey"
              variant="outlined"
              prepend-icon="mdi-stop"
              @click="stopUnfriendProcess"
            >
              Dừng/Huỷ bỏ
            </v-btn>
            <v-btn
              variant="text"
              color="error"
              :disabled="processState === 'running'"
              prepend-icon="mdi-delete-sweep-outline"
              @click="stagedFriends = []"
            >
              Xoá danh sách
            </v-btn>
          </div>

          <v-data-table
            :headers="processHeaders"
            :items="stagedFriends"
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
              Zalo kiểm soát chặt chẽ việc huỷ kết bạn liên tục bằng bot. Hãy cài đặt thời gian giãn cách đủ dài (khuyến nghị trên 15 giây) để bảo vệ tài khoản của bạn.
            </v-alert>
            <div class="d-flex flex-column gap-3" style="max-width: 480px">
              <v-text-field
                v-model.number="pacing.delaySeconds"
                type="number"
                min="5"
                label="Khoảng cách giữa mỗi lần huỷ (giây)"
                variant="outlined"
                density="compact"
              />
              <v-text-field
                v-model.number="pacing.batchSize"
                type="number"
                min="1"
                label="Số lượng huỷ mỗi đợt trước khi nghỉ dài"
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
                label="Giới hạn tối đa huỷ kết bạn một ngày"
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
import { useFriends } from '@/composables/use-friends';

const { accounts, selectedAccountId, selectAccount, loading: accountLoading } = useSelectedAccount();
function acctOnline(item: any): boolean {
  const a = item?.raw ?? item;
  return String(a?.liveStatus || a?.status || '').toLowerCase() === 'connected';
}

const { friendsDb, loadingDb, syncing, fetchFriendsDb, syncFriendsDb } = useFriends();

const tab = ref<'friends' | 'process' | 'pacing'>('friends');
const friendSearch = ref('');
const friendTag = ref<string | null>(null);
const friendSortBy = ref('recent');
const selectedRows = ref<string[]>([]);

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
const selectedLabelColor = computed(() => zaloLabelItems.value.find((i) => i.value === friendTag.value)?.color ?? '#999999');

async function loadZaloLabels(accountId: string) {
  try {
    const { data } = await api.get(`/zalo-accounts/${accountId}/labels`);
    zaloLabels.value = (data?.labels ?? []).map((l: any) => ({ id: l.id, text: l.text, color: l.color }));
  } catch (err) {
    console.error('loadZaloLabels failed:', err);
    zaloLabels.value = [];
  }
}

// Cấu hình giãn cách mặc định chống khoá tài khoản Zalo
const pacing = reactive({
  delaySeconds: 15,
  batchSize: 10,
  batchPauseMinutes: 5,
  dailyLimit: 50,
});

// Trạng thái của chiến dịch huỷ kết bạn
type ProcessState = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
const processState = ref<ProcessState>('idle');

interface StagedFriend {
  zaloUid: string;
  displayName: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  note?: string;
}
const stagedFriends = ref<StagedFriend[]>([]);

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}

const friendHeaders = [
  { title: 'Bạn Zalo', key: 'member', sortable: false },
  { title: 'Thẻ tag', key: 'tags', sortable: false },
  { title: 'Truy cập lần cuối', key: 'lastInteractionAt' },
];

const processHeaders = [
  { title: 'Tên Zalo', key: 'displayName' },
  { title: 'Zalo UID', key: 'zaloUid' },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Ghi chú', key: 'note' },
];

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN');
}

function selectAll() {
  selectedRows.value = friendsDb.value.map(f => f.zaloUidInNick);
}

async function loadFriends() {
  const acct = selectedAccountId.value;
  if (!acct) return;
  await fetchFriendsDb(acct, {
    kind: 'friend',
    page: 1,
    limit: 100,
    search: friendSearch.value.trim(),
    tag: (friendTag.value || '').trim(),
    sortBy: friendSortBy.value,
  });
}

async function syncFriends() {
  const acct = selectedAccountId.value;
  if (!acct) return;
  const result = await syncFriendsDb(acct);
  if (result?.cooldown) {
    notify(result.message, 'warning');
    return;
  }
  try {
    await api.post(`/zalo-accounts/${acct}/labels/sync`);
    await loadZaloLabels(acct);
  } catch (err) {
    console.error('labels sync failed:', err);
  }
  notify('Đã đồng bộ danh sách bạn và thẻ tag');
  await loadFriends();
}

async function onAccountChange(id: string) {
  selectAccount(id);
  selectedRows.value = [];
  stagedFriends.value = [];
  processState.value = 'idle';
  if (id) {
    await loadZaloLabels(id);
    await loadFriends();
  }
}

function stageSelected() {
  const chosen = friendsDb.value.filter(f => selectedRows.value.includes(f.zaloUidInNick));
  const existing = new Set(stagedFriends.value.map(s => s.zaloUid));

  for (const f of chosen) {
    if (!existing.has(f.zaloUidInNick)) {
      stagedFriends.value.push({
        zaloUid: f.zaloUidInNick,
        displayName: f.zaloDisplayName || f.zaloUidInNick,
        status: 'pending',
      });
    }
  }
  selectedRows.value = [];
  tab.value = 'process';
}

// ── Tiến trình xử lý chạy Pacing chống khóa nick Zalo ──
let processTimer: ReturnType<typeof setTimeout> | null = null;
let batchCounter = 0;

async function runNext() {
  if (processState.value !== 'running') return;

  // Tìm item tiếp theo chưa xử lý
  const nextItem = stagedFriends.value.find(s => s.status === 'pending');
  if (!nextItem) {
    processState.value = 'completed';
    notify('Đã hoàn tất tiến trình huỷ kết bạn!');
    return;
  }

  // Check giới hạn đợt (batch)
  if (batchCounter >= pacing.batchSize) {
    batchCounter = 0;
    processState.value = 'paused';
    notify(`Đã hoàn tất đợt ${pacing.batchSize} người, nghỉ ${pacing.batchPauseMinutes} phút để tránh bị khóa tài khoản Zalo.`, 'warning');
    processTimer = setTimeout(() => {
      processState.value = 'running';
      runNext();
    }, pacing.batchPauseMinutes * 60 * 1000);
    return;
  }

  nextItem.status = 'processing';

  try {
    // Gọi API delete friend (removeFriend) của backend
    const acct = selectedAccountId.value;
    const res = await api.delete(`/zalo-accounts/${acct}/friends/${nextItem.zaloUid}`);

    if (res.status === 200 || res.status === 204 || res.data?.success) {
      nextItem.status = 'success';
      nextItem.note = 'Đã hủy kết bạn';
    } else {
      nextItem.status = 'failed';
      nextItem.note = 'Thao tác không thành công';
    }
  } catch (err: any) {
    nextItem.status = 'failed';
    nextItem.note = err?.response?.data?.error || 'Lỗi API';
  }

  batchCounter++;

  // Lên lịch cho người tiếp theo đúng thời gian giãn cách
  processTimer = setTimeout(() => {
    runNext();
  }, pacing.delaySeconds * 1000);
}

function startUnfriendProcess() {
  if (stagedFriends.value.length === 0) return;
  processState.value = 'running';
  batchCounter = 0;
  runNext();
}

function pauseUnfriendProcess() {
  processState.value = 'paused';
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }
}

function resumeUnfriendProcess() {
  processState.value = 'running';
  runNext();
}

function stopUnfriendProcess() {
  processState.value = 'cancelled';
  if (processTimer) {
    clearTimeout(processTimer);
    processTimer = null;
  }
  // Reset trạng thái các item đang chờ/đang chạy về lại pending để có thể chạy lại sau
  stagedFriends.value.forEach(s => {
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
  return { pending: 'Chờ xử lý', processing: 'Đang hủy...', success: 'Đã hủy', failed: 'Lỗi/Thất bại' }[status] ?? status;
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
  selectedRows.value = [];
  stagedFriends.value = [];
  processState.value = 'idle';
  await loadZaloLabels(id);
  await loadFriends();
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
