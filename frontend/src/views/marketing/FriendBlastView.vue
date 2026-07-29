<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  FriendBlastView — "Gửi tin nhắn bạn bè". 3 tab cục bộ (không phải route riêng):
   1. friends  — danh sách bạn Zalo (bảng, filter tag/search, checkbox) → "Đưa vào danh
      sách gửi tin" để stage vào tab 2.
   2. send     — soạn tin (text + ảnh) + bảng người nhận (staged trước khi gửi / live
      sau khi chạy) + counters + Gửi/Tạm dừng/Tiếp tục/Huỷ.
   3. settings — pacing (delay/batch/daily cap) + blacklist theo từng nick.
-->
<template>
  <div class="d-flex flex-column h-100 ny-theme">
    <div class="d-flex align-center pa-4 pb-2 gap-3 ny-header-bar">
      <div>
        <div class="text-caption ny-subtitle">Marketing / Gửi tin nhắn bạn bè</div>
        <h1 class="text-h5 ny-title font-weight-bold">Gửi tin nhắn bạn bè</h1>
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
        <v-tab value="friends">Danh sách bạn Zalo</v-tab>
        <v-tab value="send">
          Danh sách gửi tin nhắn
          <v-chip v-if="stagedRecipients.length" size="x-small" color="primary" class="ml-2">{{ stagedRecipients.length }}</v-chip>
        </v-tab>
        <v-tab value="settings">Tùy chỉnh</v-tab>
      </v-tabs>

      <div class="flex-1-1 overflow-auto px-4 pb-4">
        <!-- ════════ TAB 1: Danh sách bạn Zalo ════════ -->
        <v-card v-if="tab === 'friends'" variant="outlined" class="ny-card">
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
            <v-btn variant="outlined" prepend-icon="mdi-checkbox-multiple-marked-outline" :disabled="!friendsDb.length" @click="selectAllFriends">
              Chọn tất cả
            </v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-checkbox-multiple-blank-outline" :disabled="!selectedFriendUids.size" @click="deselectAllFriends">
              Bỏ chọn tất cả
            </v-btn>
            <v-spacer />
            <v-btn variant="flat" color="primary" prepend-icon="mdi-refresh" :loading="syncing" @click="syncFriends">
              Cập nhật
            </v-btn>
            <v-btn
              color="accent"
              class="ny-btn-accent"
              prepend-icon="mdi-send-outline"
              :disabled="!selectedFriendUids.size"
              @click="stageSelected"
            >
              Đưa vào danh sách gửi tin ({{ selectedFriendUids.size }})
            </v-btn>
          </div>

          <v-data-table
            v-model="selectedFriendRows"
            :headers="friendHeaders"
            :items="friendsDb"
            :loading="loadingDb"
            item-value="zaloUidInNick"
            show-select
            density="comfortable"
            height="520"
            fixed-header
          >
            <template #item.member="{ item }">
              <div class="d-flex align-center gap-3 py-1">
                <div>
                  <div class="font-weight-medium text-body-1">{{ friendName(item) }}</div>
                  <div class="text-caption text-medium-emphasis">{{ item.zaloUidInNick }}</div>
                </div>
              </div>
            </template>
            <template #item.tags="{ item }">
              <div class="d-flex flex-wrap gap-1">
                <v-chip v-for="t in item.crmTagsPerNick || []" :key="t" size="x-small" variant="tonal">{{ t }}</v-chip>
                <span v-if="!(item.crmTagsPerNick || []).length" class="text-medium-emphasis">—</span>
              </div>
            </template>
            <template #item.lastInteractionAt="{ item }">
              <span class="text-medium-emphasis">{{ formatDateTime(item.lastInteractionAt) }}</span>
            </template>
            <template #item.actions="{ item }">
              <v-btn
                size="small"
                variant="text"
                icon="mdi-account-cancel-outline"
                title="Thêm vào danh sách chặn gửi tin"
                @click="blockFriend(item)"
              />
            </template>
          </v-data-table>

          <div class="d-flex align-center justify-space-between pa-3 border-t">
            <span class="text-caption text-medium-emphasis">Tổng {{ friendsDbTotal }} người</span>
            <v-pagination v-model="friendPage" :length="friendPageCount" density="comfortable" @update:model-value="loadFriends" />
          </div>
        </v-card>

        <!-- ════════ TAB 2: Danh sách gửi tin nhắn ════════ -->
        <v-card v-else-if="tab === 'send'" variant="outlined">
          <div class="pa-4 border-b">
            <v-textarea
              v-model="messageText"
              label="Nội dung tin nhắn"
              variant="outlined"
              density="comfortable"
              rows="3"
              hide-details
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
                :disabled="isRunningState"
              />
              <v-img v-if="imagePreview" :src="imagePreview" max-width="60" max-height="60" class="rounded" />
            </div>
          </div>

          <div class="d-flex align-center gap-4 pa-4 border-b flex-wrap">
            <div class="text-body-2">
              Người nhận: <b>{{ recipientCount }}</b>
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
              Gửi
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
              placeholder="Tìm theo tên..."
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 260px"
            />
            <v-select
              v-model="recipientStatusFilter"
              :items="[
                { title: 'Tất cả trạng thái', value: 'all' },
                { title: 'Chờ gửi', value: 'pending' },
                { title: 'Đang gửi', value: 'sending' },
                { title: 'Thành công', value: 'success' },
                { title: 'Thất bại', value: 'failed' },
                { title: 'Bị chặn', value: 'skipped_blacklist' },
              ]"
              label="Trạng thái"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 200px"
            />
          </div>

          <v-data-table
            :headers="recipientHeaders"
            :items="filteredRecipients"
            density="comfortable"
            :items-per-page="25"
            height="420"
            fixed-header
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
        <v-card v-else variant="outlined">
          <div class="pa-4 border-b">
            <div class="text-subtitle-1 font-weight-bold mb-3">Tốc độ gửi</div>
            <div class="d-flex gap-4 flex-wrap">
              <v-text-field v-model.number="pacing.delaySeconds" type="number" min="1" label="Nghỉ giữa mỗi tin (giây)" variant="outlined" density="compact" style="max-width: 220px" hide-details />
              <v-text-field v-model.number="pacing.batchSize" type="number" min="1" label="Số tin mỗi đợt" variant="outlined" density="compact" style="max-width: 200px" hide-details />
              <v-text-field v-model.number="pacing.batchPauseSeconds" type="number" min="0" label="Nghỉ giữa đợt (giây)" variant="outlined" density="compact" style="max-width: 220px" hide-details />
              <v-text-field v-model.number="pacing.dailyLimit" type="number" min="1" label="Giới hạn tin/ngày" variant="outlined" density="compact" style="max-width: 200px" hide-details />
            </div>
          </div>

          <div class="pa-4">
            <div class="text-subtitle-1 font-weight-bold mb-3">Danh sách chặn (không gửi tin)</div>
            <div class="d-flex align-center gap-3 mb-3 flex-wrap">
              <v-text-field v-model="blacklistUid" label="Zalo UID" variant="outlined" density="compact" hide-details style="max-width: 260px" />
              <v-text-field v-model="blacklistNote" label="Ghi chú (tuỳ chọn)" variant="outlined" density="compact" hide-details style="max-width: 260px" />
              <v-btn variant="outlined" prepend-icon="mdi-plus" :disabled="!blacklistUid.trim()" @click="addBlacklist">Thêm</v-btn>
            </div>
            <v-table density="comfortable">
              <thead>
                <tr>
                  <th>Zalo UID</th>
                  <th>Ghi chú</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in blacklist" :key="entry.id">
                  <td>{{ entry.friendUid }}</td>
                  <td class="text-medium-emphasis">{{ entry.note || '—' }}</td>
                  <td class="text-right">
                    <v-btn size="small" variant="text" icon="mdi-delete-outline" @click="removeBlacklist(entry.friendUid)" />
                  </td>
                </tr>
                <tr v-if="!blacklist.length">
                  <td colspan="3" class="text-center text-medium-emphasis pa-4">Chưa có ai trong danh sách chặn.</td>
                </tr>
              </tbody>
            </v-table>
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
import { useFriends } from '@/composables/use-friends';
import { useFriendBlast, type FriendBlastRecipient } from '@/composables/use-friend-blast';
import { uploadMedia, listMedia } from '@/api/media';

const { accounts, selectedAccountId, selectAccount, loading: accountLoading } = useSelectedAccount();
function acctOnline(item: any): boolean {
  const a = item?.raw ?? item;
  return String(a?.liveStatus || a?.status || '').toLowerCase() === 'connected';
}

const { friendsDb, friendsDbTotal, loadingDb, syncing, fetchFriendsDb, syncFriendsDb } = useFriends();
const {
  campaign, recipients, blacklist,
  createCampaign, fetchCampaign, fetchRecipients,
  startCampaign, pauseCampaign, resumeCampaign, cancelCampaign,
  fetchBlacklist, addToBlacklist, removeFromBlacklist,
} = useFriendBlast();

const tab = ref<'friends' | 'send' | 'settings'>('friends');

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}

/* ── avatar helpers ── */
function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── tab 1: friend list ── */
const friendSearch = ref('');
const friendTag = ref<string | null>(null);
const friendSortBy = ref('recent');
const friendPage = ref(1);
const FRIEND_PAGE_SIZE = 25;
const friendPageCount = computed(() => Math.max(1, Math.ceil(friendsDbTotal.value / FRIEND_PAGE_SIZE)));
const selectedFriendRows = ref<string[]>([]);
const selectedFriendUids = computed(() => new Set(selectedFriendRows.value));

/* ── Phân loại (Zalo native labels, mirrored vào crmTagsPerNick với prefix "🔵 ") ── */
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

const friendHeaders = [
  { title: 'Bạn Zalo', key: 'member', sortable: false },
  { title: 'Thẻ tag', key: 'tags', sortable: false },
  { title: 'Truy cập lần cuối', key: 'lastInteractionAt' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

function friendName(f: any): string {
  return f.aliasInNick || f.zaloDisplayName || f.contact?.crmName || f.contact?.fullName || f.zaloUidInNick;
}


function selectAllFriends() {
  selectedFriendRows.value = friendsDb.value.map((f: any) => f.zaloUidInNick);
}
function deselectAllFriends() {
  selectedFriendRows.value = [];
}

async function loadFriends() {
  const acct = selectedAccountId.value;
  if (!acct) return;
  await fetchFriendsDb(acct, {
    kind: 'friend',
    page: friendPage.value,
    limit: FRIEND_PAGE_SIZE,
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

function stageSelected() {
  const chosen = friendsDb.value.filter((f: any) => selectedFriendUids.value.has(f.zaloUidInNick));
  const existing = new Map(stagedRecipients.value.map((r) => [r.friendUid, r]));
  for (const f of chosen) {
    existing.set(f.zaloUidInNick, { friendUid: f.zaloUidInNick, displayName: friendName(f) });
  }
  stagedRecipients.value = Array.from(existing.values());
  selectedFriendRows.value = [];
  tab.value = 'send';
}

async function blockFriend(f: any) {
  const acct = selectedAccountId.value;
  if (!acct) return;
  const entry = await addToBlacklist(acct, f.zaloUidInNick, friendName(f));
  if (entry) notify(`Đã chặn ${friendName(f)}`);
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
const recipientStatusFilter = ref('all');
const filteredRecipients = computed(() => {
  const term = recipientSearch.value.trim().toLowerCase();
  return displayRecipients.value.filter((r) => {
    if (recipientStatusFilter.value !== 'all' && r.status !== recipientStatusFilter.value) return false;
    if (term && !(r.displayName || '').toLowerCase().includes(term)) return false;
    return true;
  });
});

const recipientHeaders = [
  { title: '#', key: 'friendUid' },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Tên Zalo', key: 'displayName' },
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
    const created = await createCampaign(acct, {
      messageText: messageText.value.trim() || undefined,
      imageUrl: media.imageUrl,
      imageFilename: media.imageFilename,
      pacing: { ...pacing },
      friendUids: stagedRecipients.value.map((r) => r.friendUid),
    });
    if (!created) {
      notify('Không tạo được chiến dịch', 'error');
      return;
    }
    const started = await startCampaign(acct, created.id);
    if (!started?.claimed) {
      notify('Không bắt đầu được chiến dịch', 'error');
      return;
    }
    notify('Đã bắt đầu gửi tin');
    startPolling();
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

/* ── tab 3: pacing + blacklist ── */
const pacing = reactive({ delaySeconds: 5, batchSize: 20, batchPauseSeconds: 60, dailyLimit: 200 });
const blacklistUid = ref('');
const blacklistNote = ref('');

async function addBlacklist() {
  const acct = selectedAccountId.value;
  if (!acct || !blacklistUid.value.trim()) return;
  const entry = await addToBlacklist(acct, blacklistUid.value.trim(), blacklistNote.value.trim() || undefined);
  if (entry) {
    notify('Đã thêm vào danh sách chặn');
    blacklistUid.value = '';
    blacklistNote.value = '';
  }
}

async function removeBlacklist(friendUid: string) {
  const acct = selectedAccountId.value;
  if (!acct) return;
  const ok = await removeFromBlacklist(acct, friendUid);
  if (ok) notify('Đã bỏ chặn');
}

/* ── lifecycle ── */
function onAccountChange(id: string) {
  selectAccount(id);
}

watch(selectedAccountId, async (id, prevId) => {
  if (!id || id === prevId) return;
  stopPolling();
  campaign.value = null;
  stagedRecipients.value = [];
  friendPage.value = 1;
  await loadFriends();
  await fetchBlacklist(id);
  await loadZaloLabels(id);
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

.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.border-b { border-bottom: 1px solid var(--ny-border); }
.border-t { border-top: 1px solid var(--ny-border); }
</style>
