<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  GroupBlastView — "Gửi tin nhắn nhóm".
-->
<template>
  <div class="d-flex flex-column h-100 ny-theme">
    <div class="d-flex align-center pa-4 pb-2 gap-3 ny-header-bar">
      <div>
        <div class="text-caption ny-subtitle">Marketing / Gửi tin nhắn nhóm</div>
        <h1 class="text-h5 ny-title font-weight-bold">Gửi tin nhắn nhóm</h1>
      </div>
      <v-spacer />
      <v-select
        v-model="selectedAccountId"
        :items="accounts"
        item-title="displayName"
        item-value="id"
        label="Tài khoản"
        variant="outlined"
        density="compact"
        hide-details
        class="ny-select"
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

    <v-alert v-if="!selectedAccountId" type="info" variant="tonal" class="mx-4 ny-alert" icon="mdi-information">
      Chọn một tài khoản Zalo để bắt đầu.
    </v-alert>

    <template v-else>
      <v-tabs v-model="tab" color="primary" class="px-4 flex-0-0 ny-tabs">
        <v-tab value="groups">Danh sách nhóm Zalo</v-tab>
        <v-tab value="send">
          Danh sách gửi tin nhắn
          <v-chip v-if="stagedRecipients.length" size="x-small" color="primary" class="ml-2">{{ stagedRecipients.length }}</v-chip>
        </v-tab>
        <v-tab value="settings">Tùy chỉnh</v-tab>
      </v-tabs>

      <div class="flex-1-1 overflow-auto px-4 pb-4 ny-content">
        <!-- ════════ TAB 1: Danh sách nhóm Zalo ════════ -->
        <v-card v-if="tab === 'groups'" variant="outlined" class="ny-card">
          <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
            <v-text-field
              v-model="groupSearch"
              placeholder="Tìm theo tên nhóm..."
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
            <v-btn variant="outlined" prepend-icon="mdi-checkbox-multiple-marked-outline" :disabled="!filteredGroups.length" @click="selectedGroupRows = filteredGroups.map(g => g.id)">
              Chọn tất cả
            </v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-checkbox-multiple-blank-outline" :disabled="!selectedGroupRows.length" @click="selectedGroupRows = []">
              Bỏ chọn tất cả
            </v-btn>
            <v-spacer />
            <v-btn variant="flat" color="primary" prepend-icon="mdi-refresh" :loading="loadingGroups" @click="syncGroupsAndLabels">
              Cập nhật
            </v-btn>
            <v-btn
              color="accent"
              class="ny-btn-accent"
              prepend-icon="mdi-send-outline"
              :disabled="!selectedGroupRows.length"
              @click="stageSelected"
            >
              Đưa vào danh sách gửi tin ({{ selectedGroupRows.length }})
            </v-btn>
          </div>

          <v-data-table
            v-model="selectedGroupRows"
            :headers="groupHeaders"
            :items="filteredGroups"
            :loading="loadingGroups"
            item-value="id"
            show-select
            density="comfortable"
            height="520"
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
            <template #item.name="{ item }">
              <div class="d-flex align-center gap-3 py-1">
                <div>
                  <div class="font-weight-medium text-body-1">{{ item.name || 'Nhóm không tên' }}</div>
                  <div class="text-caption text-medium-emphasis">{{ item.id }}</div>
                </div>
              </div>
            </template>
            <template #item.totalMember="{ item }">
              <v-chip size="small" variant="tonal" color="info">{{ item.totalMember }} thành viên</v-chip>
            </template>
          </v-data-table>
        </v-card>

        <!-- ════════ TAB 2: Danh sách gửi tin nhắn ════════ -->
        <v-card v-else-if="tab === 'send'" variant="outlined" class="ny-card">
          <div class="pa-4 border-b">
            <v-textarea
              v-model="messageText"
              label="Nội dung tin nhắn gửi vào nhóm"
              variant="outlined"
              density="comfortable"
              rows="3"
              hide-details
              class="ny-input"
              :disabled="isRunningState"
            />
            <div class="d-flex align-center gap-3 mt-3">
              <v-file-input
                v-model="imageFile"
                label="Đính kèm ảnh (tuỳ chọn)"
                prepend-icon="mdi-image-outline"
                variant="outlined"
                density="compact"
                accept="image/*"
                hide-details
                style="max-width: 360px"
                class="ny-input"
                :disabled="isRunningState"
              />
              <v-img v-if="imagePreview" :src="imagePreview" max-width="60" max-height="60" class="rounded" />
            </div>
          </div>

          <div class="d-flex align-center gap-4 pa-4 border-b flex-wrap">
            <div class="text-body-2">
              Nhóm nhận: <b>{{ recipientCount }}</b>
            </div>
            <div class="text-body-2">Đã gửi: <b>{{ campaign?.sentCount ?? 0 }}</b></div>
            <div class="text-body-2 text-success">Thành công: <b>{{ campaign?.successCount ?? 0 }}</b></div>
            <div class="text-body-2 text-error">Thất bại: <b>{{ campaign?.failedCount ?? 0 }}</b></div>
            <v-chip v-if="campaign" size="small" :color="stateColor(campaign.state)" variant="tonal">{{ stateLabel(campaign.state) }}</v-chip>
            <v-spacer />
            <v-btn variant="text" prepend-icon="mdi-close" :disabled="isRunningState || !stagedRecipients.length" @click="clearStaged">
              Xoá danh sách
            </v-btn>
            <v-btn
              v-if="!campaign || campaign.state === 'draft'"
              color="primary"
              prepend-icon="mdi-send"
              :loading="sending"
              :disabled="!stagedRecipients.length || (!messageText.trim() && !imageFile)"
              @click="sendBlast"
            >
              Gửi vào nhóm
            </v-btn>
            <v-btn v-if="campaign?.state === 'running'" color="warning" prepend-icon="mdi-pause" @click="pauseBlast">
              Tạm dừng
            </v-btn>
            <v-btn v-if="campaign?.state === 'paused'" color="primary" prepend-icon="mdi-play" @click="resumeBlast">
              Tiếp tục
            </v-btn>
            <v-btn v-if="isRunningState" color="error" variant="outlined" prepend-icon="mdi-stop" @click="cancelBlast">
              Huỷ
            </v-btn>
          </div>

          <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
            <v-text-field
              v-model="recipientSearch"
              placeholder="Tìm theo tên nhóm..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 260px"
              class="ny-input"
            />
          </div>

          <v-data-table
            :headers="recipientHeaders"
            :items="filteredRecipients"
            density="comfortable"
            :items-per-page="25"
            height="420"
            fixed-header
            class="ny-table"
          >
            <template #item.status="{ item }">
              <v-chip size="small" :color="recipientStatusColor(item.status)" variant="tonal">
                {{ recipientStatusLabel(item.status) }}
              </v-chip>
            </template>
            <template #item.note="{ item }">
              <span class="text-caption text-medium-emphasis">{{ item.note || '—' }}</span>
            </template>
          </v-data-table>
        </v-card>

        <!-- ════════ TAB 3: Tùy chỉnh ════════ -->
        <v-card v-else variant="outlined" class="ny-card">
          <div class="pa-4 border-b">
            <div class="text-subtitle-1 font-weight-bold mb-3 ny-title">Tốc độ gửi</div>
            <div class="d-flex gap-4 flex-wrap">
              <v-text-field v-model.number="pacing.delaySeconds" type="number" min="1" label="Nghỉ giữa mỗi nhóm (giây)" variant="outlined" density="compact" style="max-width: 220px" class="ny-input" hide-details />
              <v-text-field v-model.number="pacing.batchSize" type="number" min="1" label="Số nhóm mỗi đợt" variant="outlined" density="compact" style="max-width: 200px" class="ny-input" hide-details />
              <v-text-field v-model.number="pacing.batchPauseSeconds" type="number" min="0" label="Nghỉ giữa đợt (giây)" variant="outlined" density="compact" style="max-width: 220px" class="ny-input" hide-details />
              <v-text-field v-model.number="pacing.dailyLimit" type="number" min="1" label="Giới hạn nhóm/ngày" variant="outlined" density="compact" style="max-width: 200px" class="ny-input" hide-details />
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
import { ref, reactive, computed, onBeforeUnmount, watch } from 'vue';
import { api } from '@/api/index';
import { useSelectedAccount } from '@/composables/use-selected-account';
import { useFriendBlast, type FriendBlastRecipient } from '@/composables/use-friend-blast';
import { uploadMedia, listMedia } from '@/api/media';

const { accounts, selectedAccountId, selectAccount, loading: accountLoading } = useSelectedAccount();
function acctOnline(item: any): boolean {
  const a = item?.raw ?? item;
  return String(a?.liveStatus || a?.status || '').toLowerCase() === 'connected';
}

const {
  campaign, recipients,
  fetchCampaign, fetchRecipients,
  startCampaign, pauseCampaign, resumeCampaign, cancelCampaign,
} = useFriendBlast();

const tab = ref<'groups' | 'send' | 'settings'>('groups');
const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}



/* ── tab 1: group list ── */
const groupSearch = ref('');
const groupTag = ref<string | null>(null);
const groups = ref<Array<{ id: string; name: string; totalMember: number; tags?: string[]; crmTagsPerNick?: string[] }>>([]);
const loadingGroups = ref(false);
const selectedGroupRows = ref<string[]>([]);

const groupHeaders = [
  { title: 'Tên nhóm Zalo', key: 'name', sortable: true },
  { title: 'Thẻ tag', key: 'tags', sortable: false },
  { title: 'Thành viên', key: 'totalMember', sortable: true },
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

function stageSelected() {
  const chosen = groups.value.filter((g) => selectedGroupRows.value.includes(g.id));
  const existing = new Map(stagedRecipients.value.map((r) => [r.friendUid, r]));
  for (const g of chosen) {
    existing.set(g.id, { friendUid: g.id, displayName: g.name });
  }
  stagedRecipients.value = Array.from(existing.values());
  selectedGroupRows.value = [];
  tab.value = 'send';
}

/* ── tab 2: compose + send ── */
const stagedRecipients = ref<Array<{ friendUid: string; displayName: string }>>([]);
const messageText = ref('');
const imageFile = ref<File | null>(null);
const sending = ref(false);
const imagePreview = computed(() => (imageFile.value ? URL.createObjectURL(imageFile.value) : null));

const isRunningState = computed(() => campaign.value?.state === 'running' || campaign.value?.state === 'paused');
const recipientCount = computed(() => (campaign.value ? campaign.value.totalRecipients : stagedRecipients.value.length));

const displayRecipients = computed(() => {
  if (campaign.value) return recipients.value;
  return stagedRecipients.value.map((r) => ({
    id: r.friendUid,
    friendUid: r.friendUid,
    displayName: r.displayName,
    status: 'pending',
    note: null,
  })) as FriendBlastRecipient[];
});

const recipientSearch = ref('');
const filteredRecipients = computed(() => {
  const term = recipientSearch.value.trim().toLowerCase();
  return displayRecipients.value.filter((r) => {
    if (term && !(r.displayName || '').toLowerCase().includes(term)) return false;
    return true;
  });
});

const recipientHeaders = [
  { title: 'Mã nhóm', key: 'friendUid' },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Tên nhóm Zalo', key: 'displayName' },
  { title: 'Ghi chú', key: 'note' },
];

function recipientStatusLabel(status: string): string {
  return { pending: 'Chờ gửi', sending: 'Đang gửi', success: 'Thành công', failed: 'Thất bại', skipped_blacklist: 'Bị chặn' }[status] ?? status;
}
function recipientStatusColor(status: string): string {
  return { pending: 'grey', sending: 'info', success: 'success', failed: 'error', skipped_blacklist: 'warning' }[status] ?? 'grey';
}
function stateLabel(state: string): string {
  return { draft: 'Nháp', running: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn tất', cancelled: 'Đã huỷ' }[state] ?? state;
}
function stateColor(state: string): string {
  return { draft: 'grey', running: 'info', paused: 'warning', completed: 'success', cancelled: 'error' }[state] ?? 'grey';
}

function clearStaged() {
  stagedRecipients.value = [];
}

async function uploadImageIfNeeded(): Promise<{ imageUrl?: string; imageFilename?: string }> {
  if (!imageFile.value) return {};
  const uploaded = await uploadMedia([imageFile.value]);
  const asset = uploaded.assets[0];
  if (!asset) return {};
  const items = await listMedia({ sort: 'newest', limit: 10 });
  const found = items.find((i) => i.id === asset.id);
  return { imageUrl: found?.url ?? undefined, imageFilename: asset.name };
}

async function sendBlast() {
  const acct = selectedAccountId.value;
  if (!acct || !stagedRecipients.value.length) return;
  sending.value = true;
  try {
    const media = await uploadImageIfNeeded();
    // Gửi yêu cầu qua endpoint group-blasts mới tạo
    const { data } = await api.post(`/zalo-accounts/${acct}/group-blasts`, {
      messageText: messageText.value.trim() || undefined,
      imageUrl: media.imageUrl,
      imageFilename: media.imageFilename,
      pacing: { ...pacing },
      groupUids: stagedRecipients.value.map((r) => r.friendUid),
    });
    const created = data?.campaign;
    if (!created) {
      notify('Không tạo được chiến dịch gửi tin nhóm', 'error');
      return;
    }
    const started = await startCampaign(acct, created.id);
    if (!started?.claimed) {
      notify('Không bắt đầu được chiến dịch', 'error');
      return;
    }
    notify('Đã bắt đầu gửi tin nhắn vào nhóm');
    startPolling();
  } catch (err) {
    console.error(err);
    notify('Lỗi khi gửi tin nhắn nhóm', 'error');
  } finally {
    sending.value = false;
  }
}

async function pauseBlast() {
  const acct = selectedAccountId.value;
  if (!acct || !campaign.value) return;
  await pauseCampaign(acct, campaign.value.id);
  notify('Đã tạm dừng');
}

async function resumeBlast() {
  const acct = selectedAccountId.value;
  if (!acct || !campaign.value) return;
  await resumeCampaign(acct, campaign.value.id);
  notify('Đã tiếp tục gửi');
  startPolling();
}

async function cancelBlast() {
  const acct = selectedAccountId.value;
  if (!acct || !campaign.value) return;
  stopPolling();
  await cancelCampaign(acct, campaign.value.id);
  notify('Đã huỷ chiến dịch');
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
const POLL_MS = 2000;
function startPolling() {
  stopPolling();
  poll();
}
async function poll() {
  const acct = selectedAccountId.value;
  const id = campaign.value?.id;
  if (!acct || !id) return;
  await fetchCampaign(acct, id);
  await fetchRecipients(acct, id, { pageSize: 200 });
  if (campaign.value?.state === 'running') {
    pollTimer = setTimeout(poll, POLL_MS);
  }
}
function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/* ── tab 3: pacing ── */
const pacing = reactive({ delaySeconds: 5, batchSize: 20, batchPauseSeconds: 60, dailyLimit: 200 });

/* ── lifecycle ── */
function onAccountChange(id: string) {
  selectAccount(id);
}

watch(selectedAccountId, async (id, prevId) => {
  if (!id || id === prevId) return;
  stopPolling();
  campaign.value = null;
  stagedRecipients.value = [];
  await loadZaloLabels(id);
  await loadGroups();
}, { immediate: true });

onBeforeUnmount(stopPolling);
watch(imageFile, (_, prev) => {
  if (prev) URL.revokeObjectURL(URL.createObjectURL(prev));
});
</script>

<style scoped>
/* Tone màu Nhà Yến Academy */
.ny-theme {
  --ny-bg-primary: #F7F8FC;
  --ny-bg-secondary: #FFFFFF;
  --ny-bg-tertiary: #F1F3F9;
  --ny-primary: #2F80ED;
  --ny-primary-light: #8E75F5;
  --ny-secondary: #4DA3FF;
  --ny-accent: #FFB84D;
  --ny-text-primary: #1E202C;
  --ny-text-secondary: #5F6173;
  --ny-border: #EAECEF;

  font-family: 'Quicksand', sans-serif !important;
  background-color: var(--ny-bg-primary);
}

.ny-header-bar {
  background-color: var(--ny-bg-secondary);
  border-bottom: 1px solid var(--ny-border);
}

.ny-title {
  color: var(--ny-text-primary);
  font-family: 'Quicksand', sans-serif !important;
}

.ny-subtitle {
  color: var(--ny-text-secondary);
}

.ny-tabs {
  background: var(--ny-bg-secondary);
  border-bottom: 1px solid var(--ny-border);
}

.ny-card {
  background-color: var(--ny-bg-secondary) !important;
  border: 1px solid var(--ny-border) !important;
  border-radius: 18px !important;
  box-shadow: 0 4px 12px rgba(108, 76, 241, 0.03) !important;
}

.ny-input :deep(.v-field) {
  border-radius: 10px !important;
}

.ny-btn-accent {
  background: linear-gradient(135deg, var(--ny-accent), #4db6ac) !important;
  color: #fff !important;
}

.ny-table {
  background-color: var(--ny-bg-secondary) !important;
}

.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.border-b { border-bottom: 1px solid var(--ny-border); }
</style>
